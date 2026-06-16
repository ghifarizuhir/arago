# Arago Phase 1 — MVP Plan Index

Phase 1 is split into **5 sequential slices**. Each slice produces working, testable software on its own and must be completed (tests green + committed) before starting the next.

| # | Slice | File | Output |
|---|-------|------|--------|
| 1 | Foundation | `2026-06-16-arago-phase1-slice1-foundation.md` | Monorepo + validators + DB schema; `pnpm install`, typecheck, `db:push` all pass |
| 2 | Auth & Shell | `2026-06-16-arago-phase1-slice2-auth-shell.md` | register → login → workspace → dashboard with sidebar |
| 3 | AI Engine & Modul Ajar | `2026-06-16-arago-phase1-slice3-ai-modul.md` | upload PDF/DOCX → AI extract summary + topics |
| 4 | Bahan Ajar & Kisi-kisi | `2026-06-16-arago-phase1-slice4-bahan-kisi.md` | AI generate + edit material (Tiptap) and blueprint indicators |
| 5 | Asesmen & Student | `2026-06-16-arago-phase1-slice5-asesmen-student.md` | publish assessment → student takes → auto-grade + review |

## Source spec

`docs/superpowers/specs/2026-06-16-arago-platform-design.md`

## Execution

Run slices in order. Within a slice, use **superpowers:subagent-driven-development** (fresh subagent per task, review between tasks) or **superpowers:executing-plans** (inline batch execution).

## Cross-slice invariants (locked in Slice 1)

- `@arago/db` exposes subpath exports `@arago/db/client` and `@arago/db/schema`; `@arago/ai` exposes `@arago/ai/grading`.
- `blueprints.creatorId` and `teaching_materials.creatorId` are NOT NULL — every insert sets them from the session.
- `workspaces` has NO `deletedAt` — do not filter workspaces by soft-delete.
- All workspace-scoped queries use `and(eq(...), isNull(deletedAt))` — never the JS `&&` short-circuit.
- Active workspace lives in httpOnly cookie `arago-workspace-id` (`WORKSPACE_COOKIE`).
- For Phase 1, `submissions` references `assessmentId` + `studentId` directly (no `classAssignments` until Phase 3).

## Manual prerequisites

- A Postgres database (local or Supabase) with `DATABASE_URL` set.
- A Supabase Storage bucket named `modules` (public read) with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` with `AI_PROVIDER=openai`).
