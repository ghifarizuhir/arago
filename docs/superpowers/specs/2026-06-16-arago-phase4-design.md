# Arago Phase 4 — Polish + Notifications + Analytics — Design

**Date:** 2026-06-16
**Status:** Approved
**Parent spec:** `2026-06-16-arago-platform-design.md` §10 Fase 4
**Builds on:** Phases 1–3 (PRs #1–#11), merged to `master`. Local dev DB via `docker-compose.yml` (PR #12).

---

## Scope

Phase 4 = clear the accumulated Phase 1–3 tech-debt **and** add two features (Notifications, Workspace analytics). The design doc's other Fase 4 items (shortcut jump-ahead, export PDF) are **out of scope** for this phase.

4 slices, each leaves a green `next build` + passing tests; per-slice 4-stage review (implement → spec → code → security).

---

## Slice 12 — Routing & auth hardening

### typedRoutes
- Re-enable `experimental.typedRoutes: true` in `apps/web/next.config.ts` (currently `false`).
- Most `<Link href={\`/x/${id}\`}>` and `router.push(\`/x/${id}\`)` template literals are already statically typeable. The known **non-typeable** sites needing `as Route` (cast `import { type Route } from 'next'`):
  - `login` page: `router.push(callbackUrl)` where `callbackUrl` is a `searchParams` string.
  - results pages: `router.push(\`/student/assessments/${id}/results?submissionId=${...}\`)` and `router.replace(\`/student/assessments/${id}\`)` query-string redirects.
  - any other site the `next build` type pass flags — enumerate by building and fixing each reported error (do NOT blanket-cast; cast only the genuinely-dynamic ones).
- Acceptance: `next build` passes with typedRoutes on; no `as any`.

### NextAuth Edge config split
**Problem:** `middleware.ts` imports `auth` from `@/lib/auth`, which imports `./password` → bcrypt + `@arago/db` (postgres). That pulls postgres into the Edge bundle (the deferred warning).
**Fix (standard NextAuth v5 split):**
- Create `apps/web/src/lib/auth/config.ts` — exports `authConfig` (Edge-safe): `session`, `callbacks` (jwt/session), `pages`, and an empty `providers: []`. NO imports of `./password`, bcrypt, or `@arago/db`.
- `apps/web/src/lib/auth/index.ts` — `NextAuth({ ...authConfig, providers: [Credentials({ authorize → authenticateUser })] })`; still exports `handlers, auth, signIn, signOut` for app + API routes (Node runtime).
- `apps/web/src/middleware.ts` — `import { authConfig } from '@/lib/auth/config'; const { auth } = NextAuth(authConfig);` then keep the existing redirect logic in `auth((req) => {...})`. Middleware now decodes the JWT only (needs `NEXTAUTH_SECRET`), no DB/bcrypt.
- Acceptance: `next build` shows no "postgres in Edge" warning; login/guards still work (JWT unchanged).

### Deferred AI tests
- Add `@arago/ai` unit tests for `streamMaterialChat` and `streamTutor` using `MockLanguageModelV1` (mirror the existing `ai.test.ts` style) — assert each calls `getModel()` and passes the system prompt + messages through. (The pure prompt-builders are already tested; this covers the thin stream wrappers.)

---

## Slice 13 — UX polish bundle

### `/settings` page
- New `apps/web/src/app/(app)/settings/page.tsx` (+ re-add `/settings` to the sidebar nav).
- Profile: change own `name` (PATCH a new `/api/profile` route — user-scoped, `session.user.id`).
- Workspace: rename the active workspace (owner/teacher only). Reuse/extend the existing workspace route if present; else a workspace PATCH gated by `requireWorkspaceTeacher`.
- 🔒 profile route updates only the caller's own user row; workspace rename gated by role + workspace scope.

### datetime-UTC fix (Phase 3 carryover)
- `datetime-local` inputs produce naive local strings; `z.coerce.date()` parses them as UTC, shifting assignment windows by the tz offset.
- Fix: in the teacher assignment form (`/classes/[id]`), convert the local input value to a proper ISO instant before POST (e.g. `new Date(localValue).toISOString()` which interprets the input in the browser's local zone), and display stored windows with `toLocaleString('id-ID')` (already done). Net: what the teacher types in local time is what's stored as the correct instant.
- Acceptance: set window 08:00 local → stored instant corresponds to 08:00 local, displays 08:00.

### Results correctCount summary
- `gradeSubmission` returns `correctCount` but it isn't persisted. Add a nullable `correctCount` integer column to `submissions`; write it on submit (already computed). Show "X dari N benar" on the student results page alongside the score. (Schema change → `db:push`/generate.)

### "Lihat hasil" role-hide + 403/404 messaging
- The teacher class-detail "Lihat hasil" link shows for any `(app)` member. Render it only when the current member role is teacher/owner (the `(app)` layout already resolves membership — pass role down or fetch it).
- Results page (`/classes/[id]/results`): distinguish 403 (not a teacher → "Anda tidak punya akses") from 404 (class not found) instead of mapping all errors to "tidak ditemukan".

### Chat/tutor scroll + a11y
- `MaterialChat` + `TutorChat`: auto-scroll the message list to bottom on new messages (`useRef` + `scrollTop = scrollHeight` in an effect on `messages`).
- Add `<label className="sr-only">` + `id` association to the chat/tutor text inputs; `aria-label` on icon/repeat action buttons.

---

## Slice 14 — Notifications

### Schema
```
notifications
  id        uuid pk
  userId    uuid not null → users.id
  type      varchar(50) not null      -- e.g. 'assignment'
  message   varchar(500) not null
  linkPath  text                      -- nullable in-app path
  readAt    timestamptz               -- null = unread
  createdAt timestamptz not null default now
```
(+ relation; `db:push`/generate.) Index on `(userId, createdAt)` for the list query.

### Emit
- In `POST /api/classes/[id]/assignments` (after the assignment is created): insert one notification per **enrolled student** of that class — `type: 'assignment'`, `message: \`Asesmen baru: ${assessmentTitle}\``, `linkPath: \`/student/assessments/${assignmentId}\``. Batch insert; failure to notify must not fail the assignment creation (wrap in try/catch, log).
- No cron/due-soon (no scheduler in this stack).

### Routes (user-scoped — NOT workspace)
```
GET  /api/notifications        -> { notifications: recent (e.g. 20), unreadCount }  (where userId = session.user.id)
POST /api/notifications/read   -> body { id? }  mark one (by id, owned) or all the caller's as read
```
🔒 every query/update filters `eq(notifications.userId, session.user.id)`. A user can only read/mutate their own notifications. `id` (if provided) UUID-guarded and ownership-scoped on the UPDATE.

### UI
- `NotificationBell` client component: fetches `/api/notifications` on mount, shows unread count badge, dropdown/panel listing recent (message + relative time + link), "Tandai dibaca" (mark-all-read). Clicking an item navigates to `linkPath` and marks it read.
- Mount the bell in BOTH layouts: `(app)/layout.tsx` (teacher) and `(student)/layout.tsx` (student) — notifications are user-level, both portals show them.

---

## Slice 15 — Workspace analytics

### Route (teacher-gated, workspace-scoped)
```
GET /api/analytics  -> {
  counts: { modules, materials, blueprints, assessments, classes },   -- workspace-scoped, not soft-deleted
  students,                                                            -- distinct enrolled across workspace classes
  submissionCount,                                                     -- submissions for this workspace's assignments
  avgByAssessment: [{ assessmentId, title, avgScore, submissionCount }]
}
```
🔒 `requireWorkspaceTeacher(workspaceId)`; every aggregate scoped to the active workspace (modules/materials/blueprints via the module→workspace chain; assessments/classes by workspaceId; submissions joined through classAssignments→classes→workspaceId). Read-only.

### Page
- `apps/web/src/app/(app)/analytics/page.tsx` (client; fetches `/api/analytics`) + sidebar nav "Analitik".
- Stat cards (counts + students + submissions) and a per-assessment average-score table.

---

## Cross-cutting

- **Security invariants (carried):** every by-id query workspace-scopes; notifications user-scoped (own only); analytics teacher-gated + workspace-scoped; never trust client; exclude soft-deleted; UUID-guard path/body ids.
- **Schema changes** (correctCount on submissions, notifications table): apply via `drizzle-kit generate` + `psql` against the local docker DB (NOT `db:push` — it's an interactive TUI that hangs in automation). Keep `schema/index.ts` as source of truth.
- **Build gate:** `next build` before each slice with new routes is "done"; with typedRoutes ON from Slice 12, new links must type-check.
- **Per-slice review:** implement (haiku) → spec → code → security (sonnet), one PR per slice.

## Routes / files added (summary)
```
Slice 12: next.config (typedRoutes on); lib/auth/config.ts (new); lib/auth/index.ts + middleware.ts (split); ai stream tests
Slice 13: /settings page + /api/profile; assignment datetime fix; submissions.correctCount; results/link tweaks; chat/tutor scroll+a11y
Slice 14: notifications table; /api/notifications (GET) + /api/notifications/read (POST); emit in assignments route; NotificationBell in both layouts
Slice 15: /api/analytics (GET); /analytics page + nav
```
