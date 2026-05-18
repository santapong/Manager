import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseMarkdown } from "../parsers/markdown.js";
import { serializeMarkdown } from "../serializers/markdown.js";
import { diffAgainstWorkspace } from "../diff.js";
import type { PlanIR } from "../ir.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

function loadFixture(name: string): { md: string; ir: PlanIR } {
  const md = readFileSync(join(fixturesDir, `${name}.md`), "utf8");
  const ir = JSON.parse(
    readFileSync(join(fixturesDir, `${name}.ir.json`), "utf8"),
  ) as PlanIR;
  return { md, ir };
}

const HAPPY_FIXTURES = [
  "happy-path",
  "flat-no-milestones",
  "with-subtasks",
  "with-dependencies",
] as const;

describe("parseMarkdown — happy fixtures match golden IR", () => {
  for (const name of HAPPY_FIXTURES) {
    it(`${name}: parse matches golden`, () => {
      const { md, ir: golden } = loadFixture(name);
      const { ir, diagnostics } = parseMarkdown(md);
      const errors = diagnostics.filter((d) => d.level === "error");
      expect(errors).toEqual([]);
      expect(ir).toEqual(golden);
    });
  }
});

describe("round-trip — parse → serialize → parse equals the first parse", () => {
  for (const name of HAPPY_FIXTURES) {
    it(`${name}: round-trips`, () => {
      const { md } = loadFixture(name);
      const first = parseMarkdown(md);
      const serialized = serializeMarkdown(first.ir);
      const second = parseMarkdown(serialized);
      const secondErrors = second.diagnostics.filter(
        (d) => d.level === "error",
      );
      expect(secondErrors).toEqual([]);
      expect(second.ir).toEqual(first.ir);
    });
  }
});

describe("parseMarkdown — malformed fixtures surface diagnostics", () => {
  it("malformed-missing-project: reports missing project frontmatter", () => {
    const md = readFileSync(
      join(fixturesDir, "malformed-missing-project.md"),
      "utf8",
    );
    const { diagnostics } = parseMarkdown(md);
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("frontmatter/missing-project");
  });
});

describe("diffAgainstWorkspace stub", () => {
  it("returns every task as a create until the backend wires it up", () => {
    const { ir } = loadFixture("happy-path");
    const diff = diffAgainstWorkspace(ir);
    expect(diff.creates).toHaveLength(ir.tasks.length);
    expect(diff.updates).toEqual([]);
    expect(diff.skips).toEqual([]);
    expect(diff.conflicts).toEqual([]);
  });
});
