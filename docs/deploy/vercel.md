# Deploying Manager to Vercel

This document describes the production deploy contract for `apps/web` on
Vercel: which env vars are required, what the build does, what runtime
each route uses, and how to verify a deploy.

## Project shape

- `apps/web` is the only deployable artifact. The Vercel build runs:
  - install: `pnpm install --frozen-lockfile`
  - build:   `pnpm turbo run build --filter=@manager/web`
  - output:  `apps/web/.next`
  - region:  `iad1`
- `packages/mcp` is **not** part of the Vercel deploy. It builds in its own
  GitHub Actions workflow (`.github/workflows/mcp.yml`) and is shipped as a
  `.mcpb` artifact / npm package. The `--filter=@manager/web` build skips
  it; verify after a build that `find apps/web/.next -name "*.mcpb"` is
  empty.

## Node runtime

- `engines.node` is `>= 20.0.0`. `.nvmrc` pins `20`. Vercel's default Node
  20 runtime is correct; no `runtime` field is needed in `vercel.json`.
- Every API route under `apps/web/app/api/` declares
  `export const runtime = "nodejs"`. We do **not** use the Edge runtime
  for routes that touch the DB — the `postgres-js` driver depends on
  `net`/`tls`/`stream`, which Edge does not provide.
- `apps/web/middleware.ts` does run on Edge. It only imports
  `SESSION_COOKIE` from `@manager/auth/cookies`, which is a pure-string
  module. Do **not** import from the `@manager/auth` barrel inside
  middleware — that pulls in `node:crypto` via `service.ts`/`tokens.ts`
  and the bundle will fail.

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**.
Variables that are required have no default and will fail the build
(`apps/web/src/env.ts` is a Zod-parsed schema that throws during
`next build`).

### Required (Production + Preview)

| Variable        | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`  | Neon Postgres pooled connection string (`?sslmode=require`). For previews this should come from the Neon-Vercel integration so each PR gets its own branch. |
| `AUTH_SECRET`   | 32+ char random string. Generate: `openssl rand -base64 32`.            |

### Recommended (Production)

| Variable               | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `AUTH_TRUST_HOST`      | `true` on Vercel previews (auto-detected hostname).            |
| `AUTH_URL`             | Optional — auto-detected from `VERCEL_URL` if unset.           |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID (sign-in).                              |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret.                                    |
| `RESEND_API_KEY`       | Magic-link delivery. If unset, links log to stdout (dev only). |
| `EMAIL_FROM`           | From-address for magic-link mail. Defaults to a placeholder.   |
| `SENTRY_DSN`           | Server-side Sentry DSN.                                        |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry DSN.                                          |
| `SENTRY_ENVIRONMENT`   | Optional — defaults to `VERCEL_ENV`.                           |
| `AXIOM_TOKEN`          | Structured-log ingestion token.                                |
| `AXIOM_DATASET`        | Axiom dataset name.                                            |
| `HEALTH_TOKEN`         | Opaque bearer for `/api/health/deep`.                          |
| `NEXT_PUBLIC_APP_URL`  | Canonical app URL (used in emails). Defaults to `http://localhost:3000`. |

### Integrations / MCP

| Variable          | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `MANAGER_API_KEY` | Static bearer token for `/api/v1/*` and the MCP server. **v1 shortcut** — a single shared secret. Personal Access Tokens (per-user, argon2id-hashed, scoped) are the planned follow-up. If unset, every v1 call returns `503 auth_not_configured` (we never silently disable auth on the integrations API). Generate: `openssl rand -base64 32`. |

### Vercel-provided (do not set yourself)

- `VERCEL_ENV` — `production` / `preview` / `development`. Surfaced in
  `/api/health` and used as the Sentry environment.
- `VERCEL_GIT_COMMIT_SHA` — used to tag Sentry releases and the health
  endpoint response.

## Function configuration

`vercel.json` overrides `maxDuration` for import routes (they parse +
diff + commit Plan IR within a single transaction):

- `apps/web/app/api/imports/preview/route.ts` — 30s
- `apps/web/app/api/imports/commit/route.ts` — 30s
- `apps/web/app/api/v1/import/preview/route.ts` — 30s
- `apps/web/app/api/v1/import/commit/route.ts` — 30s

The in-code `MAX_BYTES` cap on import payloads is **4 MB**, deliberately
under Vercel's 4.5 MB Serverless Function request-body limit so we
surface a friendly 413 from the handler rather than a platform 413.

No routes need `> 30s`, and no `crons` are defined for this feature.

## Health endpoints

After a deploy, verify:

- `GET https://<deploy-url>/api/health` — public, returns
  `{ status, db, commit, env, builtAt, elapsedMs }`. 200 = OK,
  503 = DB unreachable. Cache-control: `no-store`.
- `GET https://<deploy-url>/api/health/deep` — requires
  `Authorization: Bearer $HEALTH_TOKEN`. Times each subsystem.

Both run on the Node runtime.

## Vercel MCP tooling

The Vercel deploy MCP tools (`mcp__*deploy_to_vercel` etc.) are not
currently wired into this repo's automation. If you need to deploy
programmatically, do it via the Vercel CLI or the dashboard. **Never
trigger a production deploy from automation without explicit user
approval.**

## Verifying a build locally

```sh
DATABASE_URL="postgres://user:pass@localhost:5432/test" \
AUTH_SECRET="01234567890123456789012345678901xxxxxxxx" \
pnpm --filter web build
```

Then confirm the `.mcpb` artifact is not in the deploy output:

```sh
find apps/web/.next -name "*.mcpb"   # must print nothing
```

And confirm the import routes don't pull heavy deps in:

```sh
du -sh apps/web/.next/server/app/api/imports/
# expect << 1 MB
```
