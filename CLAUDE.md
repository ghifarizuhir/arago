# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Arago is an AI-powered assessment platform for teachers. It's a Turborepo + pnpm
monorepo: a single Next.js 15 app (`apps/web`) consuming four internal packages
(`@arago/db`, `@arago/ai`, `@arago/validators`, `@arago/test-utils`). The domain
is K-12 education, so FERPA/COPPA constraints shape several design decisions (see
**Compliance invariants** below).

## Commands

All commands run from the repo root and fan out through Turbo to every workspace.

```bash
pnpm dev          # Run all dev servers (next dev for the web app)
pnpm build        # Build all packages (respects ^build dependency order)
pnpm lint         # ESLint across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm test         # Run all vitest suites
```

Database (driven by Drizzle Kit; require `DATABASE_URL`):

```bash
pnpm db:generate  # Generate SQL migrations from schema changes
pnpm db:push      # Push schema directly to DB (dev workflow)
pnpm db:migrate   # Apply generated migrations
pnpm db:seed      # Seed dev data
pnpm db:reset     # Drop + recreate
```

### Running a single test

Tests use **Vitest**. To target one package or file, run within that workspace
(turbo does not forward file-path args cleanly):

```bash
pnpm --filter @arago/web test src/lib/auth/password.test.ts
pnpm --filter @arago/ai test                       # whole package
pnpm --filter @arago/web test -t "rejects invalid"  # by test name
pnpm --filter @arago/web test:watch                 # watch mode
```

Each package has its own `vitest.config.ts`. The web app aliases `@` → `./src`.
Test files are colocated as `*.test.ts(x)` next to source (plus
`packages/ai/__tests__/`).

## Architecture

### Package boundaries and dependency direction

```
@arago/validators  (zod schemas, role enums — depended on by everyone, depends on nothing)
@arago/db          (drizzle schema + client; depends on validators-style types only)
@arago/ai          (assessment generation; depends on validators)
@arago/test-utils  (DB seed factories; depends on db + validators)
apps/web           (Next.js; depends on all of the above)
```

`@arago/validators` is the shared source of truth for types that cross package
boundaries — notably `UserRole` (`"teacher" | "student" | "admin"`), which is
re-derived from a Zod enum and reused in the DB schema, auth, and middleware.
When changing a role or status enum, update the Zod enum in `validators` first;
the DB `pgEnum` must be kept in sync manually (they are separate declarations).

Packages export raw `.ts` via the `exports` map (no build step for libraries) —
`apps/web` imports them directly and Next transpiles. Subpath exports matter:
import from `@arago/db/client` for the `db` instance and `@arago/db/schema` for
tables, not the package root, inside app code.

### Data model (`packages/db/src/schema/index.ts`)

A single schema file defines all tables and Drizzle `relations`. The hierarchy is
`districts → schools → users`, with `users.role` discriminating teacher/student/
admin. Assessment flow: `assessments → assessmentItems`, taken via
`assessmentSubmissions → submissionResponses`. `classes`/`classMemberships` model
enrollment; `standards` are educational standards linked from items; `auditLog`
records actions.

### AI assessment generation (`packages/ai`)

`generateAssessment()` is the entry point. It is **provider-agnostic** via the
Vercel AI SDK: `providers/index.ts` holds a module-level active provider
(`openai` default, or `anthropic`, selectable via `AI_PROVIDER` env or
`setProvider()`), and `getModel()` returns the configured `LanguageModelV1`.
Generation uses `generateObject` with `AssessmentOutputSchema` (Zod) to force
structured output, retries up to `MAX_RETRIES` (2) on failure, and selects a
prompt template (multiple-choice / short-answer / mixed) from the requested
`itemTypes`. Tests inject `MockLanguageModelV1` from `ai/test` rather than calling
real providers.

### Auth & authorization (`apps/web/src/lib/auth`, `middleware.ts`)

NextAuth v5 with a JWT session strategy and a Credentials provider. The chain:

- `password.ts` — `authenticateUser` (bcrypt compare) and `hashPassword`
  (bcrypt, cost 12). Passwords are never stored in plaintext; `passwordHash` is
  nullable for OAuth-style users.
- `lib/auth/index.ts` — NextAuth config. `jwt`/`session` callbacks propagate
  `role` and `schoolId` into the token and session so authorization can read them
  without a DB hit. The session shape is augmented in `src/types/next-auth.d.ts`.
- `guards.ts` — server-side helpers for route handlers: `requireAuth`,
  `requireRole(...)`, `requireTeacher` (teacher+admin), `requireAdmin`. They
  return `{ session, error }` where `error` is a ready-to-return `NextResponse`
  (401/403) — callers check `error` and return it early rather than throwing.
- `middleware.ts` — edge-level gate. `publicPaths` bypass auth; everything else
  requires login; `roleRoutes` maps each role to allowed path prefixes and
  redirects unauthorized access to `/dashboard`. Adding a new protected
  route/section means updating `roleRoutes` here **and** the guard on the handler.

Registration is a plain route handler (`app/api/auth/register/route.ts`) that
validates with `RegisterSchema`, checks email uniqueness, hashes, and inserts.

### Compliance invariants (FERPA/COPPA)

These are intentional and should be preserved when extending the model:

- **UUID primary keys** everywhere (`uuid().defaultRandom()`) — no sequential IDs
  that leak counts.
- **Soft delete** on educational records — `deletedAt` columns (e.g. `users`,
  `assessments`) instead of hard deletes; filter `deletedAt IS NULL` in queries.
- **Audit trail** via the `auditLog` table for sensitive actions.
- AI-generated content is meant to be teacher-reviewed before student visibility
  (enforce in the app/UI layer, not the schema).

## Conventions

- **TypeScript strict** plus `noUncheckedIndexedAccess` — array/record access can
  be `undefined`; the codebase uses `!` after `.returning()`/`[0]` where a row is
  guaranteed (see `test-utils` factories).
- Libraries are consumed as source TS, so keep them free of Node-only build
  assumptions; `apps/web` is the only thing that compiles to a deployable.
- Test DB helpers in `@arago/test-utils` (`seedTestUser`, `seedTestDatabase`,
  `cleanupTestData`, etc.) take a `Database` instance — integration tests that hit
  Postgres need a real `DATABASE_URL`.

## Gotchas

- There are **two** `drizzle.config.ts` files. The canonical one is
  `packages/db/drizzle.config.ts` (schema at `packages/db/src/schema/index.ts`).
  `apps/web/drizzle.config.ts` points at a `src/lib/db/schema.ts` path that does
  not exist — prefer the root `pnpm db:*` scripts, which run against
  `@arago/db`.
- The Zod role/status enums and the Drizzle `pgEnum`s are declared independently;
  changing one does not change the other.
