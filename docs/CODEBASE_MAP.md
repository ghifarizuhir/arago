# Arago — Codebase Map & Current Positioning

> **Generated:** 2026-06-06
> **Purpose:** A single-source orientation document describing what exists today,
> how the pieces fit together, and where the project currently stands.

---

## 1. What Arago Is

Arago is an **AI-powered assessment platform for K-12 teachers**. Teachers
generate, publish, and grade assessments; AI assists by generating assessment
items (questions) from a topic. Because the domain is K-12 education,
**FERPA/COPPA compliance constraints** are baked into the data model and
architecture from the start.

**Tech stack at a glance:**

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Monorepo     | Turborepo 2.4 + pnpm 9.15 workspaces          |
| Frontend/App | Next.js 15.2 (App Router), React 19           |
| Auth         | NextAuth v5 (beta) — JWT + Credentials        |
| Database     | PostgreSQL + Drizzle ORM 0.38                  |
| AI           | Vercel AI SDK 4.1 (OpenAI / Anthropic)        |
| Validation   | Zod 3.24+                                      |
| Styling      | Tailwind CSS 4.0                               |
| Testing      | Vitest 3.0                                     |
| Language     | TypeScript 5.7 (strict + noUncheckedIndexedAccess) |

---

## 2. Repository Layout

```
arago/
├── apps/
│   └── web/                  # The only deployable — Next.js 15 app
├── packages/
│   ├── validators/           # Zod schemas + shared enums (depends on nothing)
│   ├── db/                   # Drizzle schema + client
│   ├── ai/                   # AI assessment generation
│   └── test-utils/           # DB seed factories for tests
├── docs/                     # (this document lives here)
├── turbo.json                # Task orchestration
├── pnpm-workspace.yaml       # apps/* + packages/*
├── tsconfig.base.json        # Shared strict TS config
├── eslint.config.mjs         # ESLint 9 flat config
├── CLAUDE.md                 # Guidance for Claude Code
└── README.md
```

### Dependency direction (must stay acyclic)

```
validators  ──►  (everyone)        # source of truth for cross-package types
db          ──►  validators-style types
ai          ──►  validators
test-utils  ──►  db, validators
apps/web    ──►  validators, db, ai, test-utils
```

`@arago/validators` is the **shared source of truth** for types that cross
package boundaries — notably `UserRole` (`"teacher" | "student" | "admin"`),
re-derived from a Zod enum and reused in the DB schema, auth, and middleware.

> **Important:** Library packages export raw `.ts` via their `exports` map — **no
> build step**. `apps/web` imports them directly and Next transpiles. Use subpath
> imports in app code: `@arago/db/client` for the `db` instance, `@arago/db/schema`
> for tables — not the package root.

---

## 3. Package-by-Package Breakdown

### 3.1 `@arago/validators` — Shared Schemas & Enums

The foundation. Depends on nothing; depended on by everyone.

| Export path                  | Contents                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `@arago/validators`          | Re-exports everything below                                     |
| `@arago/validators/auth`     | `UserRole`, `LoginSchema`, `RegisterSchema`                     |
| `@arago/validators/user`     | `CreateUserSchema`, `UpdateUserSchema`                          |
| `@arago/validators/assessment` | `AssessmentStatus`, `ItemType`, `CreateAssessmentSchema`, `GenerateAssessmentSchema` |

**Key schemas:**
- `RegisterSchema` — name, email, password (min 8), confirmPassword, role, optional schoolId; `.refine()` enforces password match.
- `GenerateAssessmentSchema` — topic, standards[], itemCount (1–20, default 5), itemTypes (default `["multiple_choice"]`), difficulty (easy/medium/hard), gradeLevel (1–12), subject.

Tests: `src/__tests__/validators.test.ts` (30+ tests).

### 3.2 `@arago/db` — Data Layer

Drizzle ORM + `postgres` driver. PostgreSQL 16+.

| Export path          | Contents                                |
| -------------------- | --------------------------------------- |
| `@arago/db`          | Re-exports schema + client              |
| `@arago/db/schema`   | All tables, enums, relations            |
| `@arago/db/client`   | `db` instance + `Database` type         |

**Enums:** `userRoleEnum` (teacher/student/admin), `assessmentStatusEnum`
(draft/published/archived), `itemTypeEnum` (multiple_choice/short_answer).

**Tables (11):**

```
districts ──< schools ──< users
                              │
              ┌───────────────┼────────────────┐
              │               │                │
           classes      assessments       auditLog
              │               │
      classMemberships  assessmentItems ──► standards
                              │
                  assessmentSubmissions
                              │
                     submissionResponses
```

- `districts → schools → users` is the org hierarchy; `users.role` discriminates.
- Assessment flow: `assessments → assessmentItems`, taken via `assessmentSubmissions → submissionResponses`.
- `classes` / `classMemberships` model enrollment; `standards` are educational standards linked from items; `auditLog` records sensitive actions.

**Scripts (`src/`):** `migrate.ts`, `seed.ts` (district, school, teacher/student/admin, class, 12 Common Core standards, sample assessment + submission), `reset.ts` (truncates in FK order).

**Migrations:** `drizzle/0000_keen_jasper_sitwell.sql` — initial schema (11 tables, 3 enums, 16 FKs).

### 3.3 `@arago/ai` — Assessment Generation

Provider-agnostic via the Vercel AI SDK.

| Export path                          | Contents                          |
| ------------------------------------ | --------------------------------- |
| `@arago/ai`                          | `generateAssessment`, schemas, provider controls |
| `@arago/ai/assessment-generator`     | `generateAssessment` + schemas    |

- `providers/index.ts` — module-level active provider (`openai` default → `gpt-4o-mini`, or `anthropic` → `claude-sonnet-4-20250514`), selectable via `AI_PROVIDER` env or `setProvider()`. `getModel()` returns a `LanguageModelV1`.
- `assessment-generator.ts` — `generateAssessment()` entry point. Uses `generateObject` with `AssessmentOutputSchema` (Zod) to force structured output; retries up to `MAX_RETRIES` (2); selects a prompt template (multiple-choice / short-answer / mixed) from the requested `itemTypes`.
- `prompts/index.ts` — system prompt + 3 templates.
- Tests inject `MockLanguageModelV1` rather than calling real providers (`__tests__/`, ~47 tests).

### 3.4 `@arago/test-utils` — Test Factories

DB seed/cleanup helpers. Each takes a `Database` instance, so **integration tests
that use them need a real `DATABASE_URL`**.

`seedTestDistrict`, `seedTestSchool`, `seedTestUser` (with overrides),
`seedTestClass`, `seedTestDatabase`, `cleanupTestData`, plus `TEST_CONSTANTS`
fixtures.

### 3.5 `apps/web` — The Next.js Application

The only deployable (`output: "standalone"`).

**Routing & pages:**
- `app/layout.tsx` — root layout with `SessionProvider`.
- `app/page.tsx` — homepage ("Arago").
- `app/api/auth/[...nextauth]/route.ts` — NextAuth handlers.
- `app/api/auth/register/route.ts` — registration (validate → uniqueness check → hash → insert).

**Auth (`src/lib/auth/`):**
- `password.ts` — `hashPassword` (bcrypt cost 12), `authenticateUser` (bcrypt compare). `passwordHash` is nullable for OAuth-style users.
- `index.ts` — NextAuth config; `jwt`/`session` callbacks propagate `role` + `schoolId` into token/session (no DB hit for authz).
- `guards.ts` — `requireAuth`, `requireRole(...)`, `requireTeacher` (teacher+admin), `requireAdmin`. Return `{ session, error }` where `error` is a ready-to-return `NextResponse` (401/403).
- `types.ts` + `src/types/next-auth.d.ts` — session shape augmentation.

**`middleware.ts`** — edge gate. `publicPaths` bypass auth; everything else requires login; `roleRoutes` maps each role to allowed path prefixes, redirecting unauthorized access to `/dashboard`.

> Adding a protected route means updating **both** `roleRoutes` in `middleware.ts`
> **and** the guard on the handler.

---

## 4. Compliance Invariants (FERPA/COPPA)

These are intentional design decisions — **preserve them when extending**:

- **UUID primary keys** everywhere (`uuid().defaultRandom()`) — no sequential IDs that leak counts.
- **Soft delete** on educational records — `deletedAt` columns (e.g. `users`, `assessments`); filter `deletedAt IS NULL` in queries instead of hard-deleting.
- **Audit trail** via the `auditLog` table for sensitive actions.
- **AI content is teacher-reviewed** before student visibility — enforced in the app/UI layer, not the schema.

---

## 5. Commands

```bash
pnpm dev          # All dev servers (next dev)
pnpm build        # Build all (respects ^build order)
pnpm lint         # ESLint across packages
pnpm typecheck    # tsc --noEmit across packages
pnpm test         # All vitest suites

# Database (require DATABASE_URL)
pnpm db:generate  # Generate SQL migrations from schema
pnpm db:push      # Push schema directly (dev)
pnpm db:migrate   # Apply migrations
pnpm db:seed      # Seed dev data
pnpm db:reset     # Drop + recreate
```

**Single test** (turbo doesn't forward file-path args cleanly — run in-workspace):

```bash
pnpm --filter @arago/web test src/lib/auth/password.test.ts
pnpm --filter @arago/web test -t "rejects invalid"
pnpm --filter @arago/ai test
```

---

## 6. Current Positioning — Where the Project Stands

This is a **Phase 0 / foundation-stage** codebase. The skeleton and contracts are
in place; the product surface (UI, business flows) is not yet built.

### ✅ Done (foundation is solid)

- Monorepo wiring: Turbo + pnpm workspaces, strict TS, shared ESLint/Prettier.
- **Complete data model** — all 11 tables, enums, relations, an initial migration, and a working seed script.
- **Auth backend** — registration, credentials login, JWT sessions carrying role/schoolId, route guards, and edge middleware with role-based routing.
- **AI generation engine** — provider-agnostic, structured-output, retry-safe, with mock-based tests (no live API calls in CI).
- **Validation layer** — shared Zod schemas used across auth, DB, and AI.
- **Test infrastructure** — Vitest across all packages, DB seed factories, ~100+ tests total across the suites.

### 🚧 Not yet built (the gaps)

- **UI/product surface** — only a placeholder homepage and a root layout exist. No dashboard, no login/register pages, no assessment authoring/taking screens, despite `middleware.ts` redirecting to `/dashboard`.
- **Assessment lifecycle APIs** — no route handlers yet to create/publish/grade assessments or to persist AI-generated items into the DB. `@arago/ai` generates content but nothing wires it to `assessmentItems`.
- **Submission & grading flow** — schema exists (`assessmentSubmissions`, `submissionResponses`, `aiFeedback`) but no code drives it.
- **Audit logging in practice** — table exists; the seed writes one row, but app actions don't yet emit audit entries.

### ⚠️ Known gotchas / risks (carried from CLAUDE.md + observations)

- **Two `drizzle.config.ts` files.** Canonical: `packages/db/drizzle.config.ts`. The one in `apps/web/drizzle.config.ts` points at a `src/lib/db/schema.ts` path that **does not exist** — prefer the root `pnpm db:*` scripts.
- **Zod enums vs Drizzle `pgEnum`s are declared independently.** Changing a role/status in one does **not** update the other — keep them in sync manually (update the Zod enum in `validators` first).
- **NextAuth v5 is beta** (`5.0.0-beta.25`) — API may shift before stable.
- **Integration tests need a live Postgres** (`DATABASE_URL`); they `skipIf` it's absent, so a green local run may be skipping DB coverage.

### Suggested next steps (logical sequence)

1. Build login/register/dashboard pages so the middleware redirect targets exist.
2. Add assessment CRUD route handlers (guarded by `requireTeacher`) that persist AI output into `assessmentItems`.
3. Wire the submission + grading flow, emitting `auditLog` entries on sensitive actions.
4. Resolve the stale `apps/web/drizzle.config.ts` (delete or fix the schema path).

---

## 7. Conventions Quick Reference

- **TypeScript strict** + `noUncheckedIndexedAccess` — array/record access can be `undefined`; codebase uses `!` after `.returning()`/`[0]` where a row is guaranteed.
- Libraries are consumed as **source TS** — keep them free of Node-only build assumptions; `apps/web` is the only thing that compiles to a deployable.
- Test files are **colocated** as `*.test.ts(x)` next to source (plus `packages/ai/__tests__/`).
- Each package has its own `vitest.config.ts`; the web app aliases `@` → `./src`.
