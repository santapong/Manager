# ADR 0001 — Vendor ports for swappable infrastructure

- Status: accepted
- Date: 2026-05-14
- Decision drivers: PLAN.md §7 ("Vendor ports") + the locked decision that the paid tier is self-host

## Context

The paid tier of Manager is self-host. That means every vendor with a non-portable API needs an internal interface from day one — otherwise we'll be rewriting call sites at the worst possible moment (when paying customers are waiting on the self-host build).

Open-standard vendors (Postgres wire, SMTP, OAuth, OpenTelemetry-compatible tools) do not need wrappers: swapping the vendor is a config change. We pay an abstraction tax only where it's earned.

## Decision

Five ports, each with a cloud and a self-host implementation:

| Port | Type module | Cloud impl | Self-host impl |
|---|---|---|---|
| `RealtimeService` | `@manager/realtime` | Ably adapter (Phase 1) | Soketi (Pusher-compatible) |
| `BlobService` | `@manager/storage` | Vercel Blob adapter (Phase 1) | S3 / Cloudflare R2 |
| `EmailService` | `@manager/email` | Resend adapter (PR #5) | SMTP (nodemailer, Phase 1+) |
| `AuthService` | `@manager/auth` | Better-Auth-style adapter backed by our Drizzle tables (PR #5) | Same code; swap is the OAuth provider and `EmailService` |
| `SearchService` | `@manager/search` | Postgres FTS adapter (Phase 1) | Postgres FTS works unchanged |

Each port:

- Has its types in `src/types.ts`
- Has at least one runtime implementation in `src/<vendor>-adapter.ts`
- Re-exports both from `src/index.ts`

The vendor SDK only ever appears inside its adapter file. Imports from elsewhere are blocked by the ESLint `no-restricted-imports` rule in `packages/config/eslint.config.mjs` (currently catches `@vercel/blob`, `ably`, `pusher`, `resend`; add more as new vendors land).

## Consequences

- **Pro**: self-host swap is a code-change-free or near-zero-change exercise for these five concerns.
- **Pro**: tests can use no-op or fake adapters without mocking vendor SDKs.
- **Con**: small upfront cost — types we'd otherwise infer from the SDK; an extra file per vendor.
- **Con**: the ESLint rule must be kept in sync as new vendors are added.

## Explicit non-abstractions

We deliberately do **not** wrap:

- **Postgres / Neon**. We use the standard wire via Drizzle. Neon → any Postgres is a `DATABASE_URL` change. The Neon HTTP edge driver is a known coupling for edge reads — documented and accepted.
- **Inngest** (deferred to Phase 1). When it lands, the same wrapper rules apply via a `JobQueue` port.
- **Sentry / Axiom**. OpenTelemetry-compatible at the SDK level; the `logger` shim in `@manager/observability` is enough indirection for the log path. Sentry breaking-change risk is acceptable.

## Enforcement

- ESLint rule already in `packages/config/eslint.config.mjs`.
- Code review checklist: any new vendor SDK gets a new port + a new ESLint entry. Self-host parity is part of PR review for those changes.
- When the Phase 1 PRs add real adapters, this ADR's table gets a "shipped" column tick.

## Open

- Realtime self-host with Soketi assumes Pusher-compatible wire format. Verify when Ably adapter actually ships (Phase 1).
- Object-storage self-host: we'll need either an in-cluster S3 (MinIO) or a managed R2/S3 — out-of-scope for Phase 0 but factor into the self-host bundle ADR.
