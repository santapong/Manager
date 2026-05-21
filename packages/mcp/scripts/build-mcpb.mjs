#!/usr/bin/env node
/* global console, process, Buffer */
/**
 * Build a `.mcpb` Claude Desktop bundle for `@manager/mcp`.
 *
 * Layout inside the zip:
 *   manifest.json        — Claude Desktop manifest
 *   icon.svg             — placeholder app icon
 *   server.js            — bundled entrypoint (concat of dist/cli.js)
 *   server/              — the rest of dist/ (cli imports relative ./*.js)
 *   package.json         — minimal manifest declaring runtime deps
 *   node_modules/        — pre-installed runtime deps (so the user doesn't run npm)
 *
 * TODO(signing): the bundle is currently unsigned (decisions §6 defers
 * signing identity to a later DevOps PR). Sign with `mcpb sign` (or the
 * Anthropic-issued tooling once it stabilises) before publishing for real.
 *
 * Use:
 *   pnpm --filter @manager/mcp build
 *   node packages/mcp/scripts/build-mcpb.mjs
 *   # → packages/mcp/dist/manager-mcp-<version>.mcpb
 */
import { execSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const DIST = join(PACKAGE_ROOT, "dist");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(PACKAGE_ROOT, "manifest.json"), "utf8"));

  if (pkg.version !== manifest.version) {
    console.warn(
      `[build-mcpb] WARN: package.json version (${pkg.version}) and manifest version (${manifest.version}) disagree.`,
    );
  }

  if (!(await exists(join(DIST, "cli.js")))) {
    throw new Error(
      "dist/cli.js not found. Run `pnpm --filter @manager/mcp build` before packaging.",
    );
  }

  const stage = join(DIST, ".mcpb-stage");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await mkdir(join(stage, "server"), { recursive: true });

  // The CLI imports `./server.js`, `./tools/index.js`, etc., from relative
  // paths. We keep the full dist tree under `./server/` AND emit a thin
  // `server.js` shim at the root that re-exports the CLI's main module —
  // that way the manifest's `entry_point: "server.js"` works whether the
  // host launches the file directly or imports it.
  for (const entry of await listDist(DIST)) {
    if (entry.startsWith(".mcpb-stage")) continue;
    const src = join(DIST, entry);
    const dest = join(stage, "server", entry);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);
  }
  await writeFile(
    join(stage, "server.js"),
    "#!/usr/bin/env node\nimport('./server/cli.js');\n",
    "utf8",
  );

  // Copy manifest + icon.
  await cp(join(PACKAGE_ROOT, "manifest.json"), join(stage, "manifest.json"));
  if (await exists(join(PACKAGE_ROOT, "icon.svg"))) {
    await cp(join(PACKAGE_ROOT, "icon.svg"), join(stage, "icon.svg"));
  }

  // Minimal package.json — declares runtime deps + type=module so the
  // shim's `import('./server/cli.js')` works under Node ESM.
  const bundlePkg = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: "module",
    main: "server.js",
    dependencies: {
      "@modelcontextprotocol/sdk": pkg.dependencies["@modelcontextprotocol/sdk"],
      zod: pkg.dependencies.zod,
    },
  };
  await writeFile(join(stage, "package.json"), JSON.stringify(bundlePkg, null, 2));

  // Install runtime deps INTO the bundle so end-users don't need npm on
  // their machine. `--production --no-package-lock` keeps it lean.
  console.log("[build-mcpb] installing runtime deps into bundle…");
  try {
    execSync("npm install --omit=dev --no-package-lock --silent", {
      cwd: stage,
      stdio: "inherit",
    });
  } catch (e) {
    console.warn(
      "[build-mcpb] WARN: dep install failed; the .mcpb will still be produced but Claude Desktop will need network on install.",
      e instanceof Error ? e.message : e,
    );
  }

  // Zip the stage into dist/manager-mcp-<version>.mcpb.
  const out = join(DIST, `manager-mcp-${pkg.version}.mcpb`);
  await rm(out, { force: true });
  await zipDirectory(stage, out);

  // Cleanup.
  await rm(stage, { recursive: true, force: true });

  const hash = await sha256(out);
  const size = (await stat(out)).size;
  console.log(
    `[build-mcpb] wrote ${relative(PACKAGE_ROOT, out)} (${(size / 1024).toFixed(1)} KiB, sha256=${hash.slice(0, 16)}…)`,
  );
  console.log("[build-mcpb] TODO: signing — bundle is UNSIGNED (decisions §6).");
}

async function listDist(root) {
  const out = [];
  async function walk(rel) {
    const full = join(root, rel);
    const entries = await import("node:fs/promises").then((m) => m.readdir(full, { withFileTypes: true }));
    for (const e of entries) {
      const next = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(next);
      else out.push(next);
    }
  }
  await walk("");
  return out;
}

async function zipDirectory(srcDir, destZip) {
  // No `archiver` dep available — use the system `zip` if present, else
  // fall back to JS implementation.
  try {
    execSync(`zip -qr "${destZip}" .`, { cwd: srcDir, stdio: "inherit" });
    return;
  } catch {
    // fall through
  }
  // Pure-Node fallback (no deps). Implements STORE-only zip; fine for the
  // small bundle and avoids pulling archiver into the workspace.
  await writeStoreZip(srcDir, destZip);
}

async function writeStoreZip(srcDir, destZip) {
  const { readdir } = await import("node:fs/promises");
  const out = createWriteStream(destZip);
  const entries = [];
  let offset = 0;

  async function walk(rel) {
    const full = join(srcDir, rel);
    const dirents = await readdir(full, { withFileTypes: true });
    for (const d of dirents) {
      const nextRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) await walk(nextRel);
      else await writeOne(nextRel);
    }
  }

  async function writeOne(relPath) {
    const data = await readFile(join(srcDir, relPath));
    const nameBuf = Buffer.from(relPath);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = store
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    out.write(local);
    out.write(nameBuf);
    out.write(data);
    entries.push({ name: nameBuf, crc, size: data.length, offset });
    offset += local.length + nameBuf.length + data.length;
  }

  await walk("");

  const cdStart = offset;
  for (const e of entries) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12); // time
    cd.writeUInt16LE(0, 14); // date
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.size, 20);
    cd.writeUInt32LE(e.size, 24);
    cd.writeUInt16LE(e.name.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk #
    cd.writeUInt16LE(0, 36); // internal
    cd.writeUInt32LE(0, 38); // external
    cd.writeUInt32LE(e.offset, 42);
    out.write(cd);
    out.write(e.name);
    offset += cd.length + e.name.length;
  }
  const cdSize = offset - cdStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  end.writeUInt16LE(0, 20);
  out.write(end);

  await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));
}

function crc32(buf) {
  let table = crc32.__table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    crc32.__table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function sha256(path) {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), h);
  return h.digest("hex");
}

main().catch((e) => {
  console.error("[build-mcpb] failed:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
