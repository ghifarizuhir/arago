# Phase 4 Slice 13 — UX Polish Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the deferred UX fixes: a `/settings` page (profile + workspace rename), the Phase 3 datetime-UTC fix, a results correct-count summary, clearer results-page access messaging, and chat/tutor scroll + input a11y.

**Architecture:** Add a user-scoped `/api/profile` PATCH and a teacher-gated `/api/workspaces/[id]` PATCH; a `/settings` client page driving both. Fix the assignment form to send a proper UTC instant. Add a nullable `correctCount` column to `submissions`, write it on submit, surface it on results. Small client tweaks for scroll/a11y.

**Tech Stack:** Next 15 route handlers + client pages, Drizzle, Zod, Vitest.

**Security invariants:** `/api/profile` updates only `session.user.id`'s own row (name only — never email/passwordHash/role). Workspace rename gated by `requireWorkspaceTeacher` + workspace scope. No client-trust.

---

## File Structure

- Modify `packages/db/src/schema/index.ts` — `submissions.correctCount` (nullable int).
- Create `apps/web/src/app/api/profile/route.ts` — PATCH own name.
- Create `apps/web/src/app/api/workspaces/[id]/route.ts` — PATCH rename (teacher/owner).
- Create `apps/web/src/app/(app)/settings/page.tsx` — settings UI.
- Modify `apps/web/src/components/sidebar.tsx` — add Settings nav.
- Modify `apps/web/src/app/api/student/submissions/route.ts` — persist `correctCount`.
- Modify `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx` — show correct count.
- Modify `apps/web/src/app/(app)/classes/[id]/page.tsx` — assignment datetime → ISO instant.
- Modify `apps/web/src/app/(app)/classes/[id]/results/page.tsx` — 403 vs 404 messaging.
- Modify `apps/web/src/components/material-chat.tsx` + `tutor-chat.tsx` — scroll + a11y.

---

## Task 1: `submissions.correctCount` column + persist on submit

**Files:**
- Modify: `packages/db/src/schema/index.ts`
- Modify: `apps/web/src/app/api/student/submissions/route.ts`

- [ ] **Step 1: add the column**

In `packages/db/src/schema/index.ts`, in the `submissions` table, add after the `score` line:

```ts
  correctCount: integer("correct_count"),
```
(`integer` is already imported.)

- [ ] **Step 2: apply to the local DB (non-interactive)**

Run (do NOT use `db:push` — it's an interactive TUI that hangs):
```bash
pnpm --filter @arago/db exec drizzle-kit generate --name add_correct_count </dev/null
docker exec -i arago-postgres psql -U arago -d arago -v ON_ERROR_STOP=1 < packages/db/drizzle/$(ls -t packages/db/drizzle/*.sql | head -1 | xargs basename)
```
Expected: `ALTER TABLE` adding `correct_count`. (If no docker DB is running, run `docker compose up -d` first; if still unreachable, flag DONE_WITH_CONCERNS — the schema change + write code still land, application to a live DB is pending.)

- [ ] **Step 3: persist correctCount on submit**

In `apps/web/src/app/api/student/submissions/route.ts`, `gradeSubmission` already returns `correctCount`. Destructure it and write it. Find:
```ts
  const { score, totalItems } = gradeSubmission(items, answers)
```
Replace with:
```ts
  const { score, totalItems, correctCount } = gradeSubmission(items, answers)
```
Then in the `.values({...})` insert, add `correctCount,` alongside `score`.

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @arago/db typecheck && rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add packages/db/src/schema/index.ts packages/db/drizzle apps/web/src/app/api/student/submissions/route.ts
git commit -m "feat(db): submissions.correctCount column + persist on submit"
```

---

## Task 2: Show correct count on the results page

**Files:**
- Modify: `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx`

- [ ] **Step 1: extend the Submission type + display**

In the results page, add `correctCount` to the `Submission` type:
```ts
type Submission = { id: string; score: number | null; correctCount: number | null; totalItems: number; answers: Record<string, string>; submittedAt: string }
```
In the score summary line, add the correct-count. Find the line rendering the score (`Nilai: ... / 100 · {submission.totalItems} soal`) and change it to also show:
```tsx
{submission.correctCount ?? '—'} dari {submission.totalItems} benar
```
e.g. render: `Nilai: <b>{submission.score ?? '—'}</b> / 100 · {submission.correctCount ?? '—'} dari {submission.totalItems} benar`.

(The submission-detail route already returns the full submission row via `.select()` from `submissions`, so `correctCount` is included automatically — no route change needed.)

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add "apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx"
git commit -m "feat(web): show correct-count summary on results page"
```

---

## Task 3: Assignment datetime → correct UTC instant

**Files:**
- Modify: `apps/web/src/app/(app)/classes/[id]/page.tsx`

- [ ] **Step 1: convert local datetime to ISO before POST**

`<input type="datetime-local">` yields a naive local string (e.g. `2026-07-01T08:00`). Sending it raw makes `z.coerce.date()` mis-parse the zone. Convert with `new Date(localValue).toISOString()` (interprets the input in the browser's local zone → correct instant). In `createAssignment`, change the body construction. Find:
```tsx
        body: JSON.stringify({ assessmentId: pickAssessment, openAt, dueAt }),
```
Replace with:
```tsx
        body: JSON.stringify({
          assessmentId: pickAssessment,
          openAt: new Date(openAt).toISOString(),
          dueAt: new Date(dueAt).toISOString(),
        }),
```
(Display already uses `toLocaleString('id-ID')`, which renders the stored instant back in local time — so what the teacher types is what they see.)

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add "apps/web/src/app/(app)/classes/[id]/page.tsx"
git commit -m "fix(web): send assignment window as UTC instant (datetime-local local-zone fix)"
```

---

## Task 4: `/api/profile` PATCH (own name)

**Files:**
- Create: `apps/web/src/app/api/profile/route.ts`

- [ ] **Step 1: write the route**

🔒 Updates ONLY the caller's own `users` row, name only. Create `apps/web/src/app/api/profile/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { users } from '@arago/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [updated] = await db
    .update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, session.user.id))
    .returning({ id: users.id, name: users.name })

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ user: updated })
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/api/profile/route.ts
git commit -m "feat(web): PATCH /api/profile — update own name"
```

---

## Task 5: `/api/workspaces/[id]` PATCH (rename, teacher/owner)

**Files:**
- Create: `apps/web/src/app/api/workspaces/[id]/route.ts`

- [ ] **Step 1: write the route**

🔒 Gated by `requireWorkspaceTeacher`; renames only the named workspace; the id must match the active workspace context (avoid renaming an arbitrary workspace the user happens to be a teacher of via a stale path — scope to the active workspace). Create `apps/web/src/app/api/workspaces/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { workspaces } from '@arago/db/schema'
import { eq } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const { error, session } = await requireWorkspaceTeacher(id)
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [updated] = await db
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, id))
    .returning({ id: workspaces.id, name: workspaces.name })

  if (!updated) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  return NextResponse.json({ workspace: updated })
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add "apps/web/src/app/api/workspaces/[id]/route.ts"
git commit -m "feat(web): PATCH /api/workspaces/[id] — rename (teacher/owner gated)"
```

---

## Task 6: `/settings` page + nav

**Files:**
- Create: `apps/web/src/app/(app)/settings/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: write the settings page (client)**

Profile name (from session via `/api/profile` — but we need current values; fetch session name from `next-auth/react` `useSession`, and workspace name is shown in the sidebar already). Simplest: a profile-name input (PATCH /api/profile) + a workspace-name input that needs the active workspace id. Get the active workspace id from a small fetch — reuse `/api/classes`? No. Add the workspace id via the page reading it. Simplest reliable source: a `GET /api/profile`? Out of scope. Instead, fetch the active workspace through a new lightweight read is overkill — use `useSession` for the name, and for workspace rename POST to `/api/workspaces/[id]` we need the id. The `(app)/layout` knows it but is a server component. 

Pragmatic approach: this page fetches the active workspace id+name from the existing `/api/workspaces` list filtered by the active one is not available. Add a tiny `GET` to `/api/workspaces/[id]`? To avoid scope creep, render ONLY the profile-name form in `/settings` for this slice and defer workspace rename to where the id is available — OR include the active workspace id by adding it to a cookie-readable client value.

DECISION (keep it shippable + in-spec): the page renders the profile-name form (PATCH `/api/profile`) AND a workspace-rename form, getting the active workspace id from a new `GET /api/workspaces/active` is avoided — instead read it via the existing classes-independent path: add a `GET` handler to the `/api/workspaces/[id]/route.ts`? Still needs the id.

Implement the active-workspace id read by adding a minimal `GET /api/profile` that returns `{ user: {id,name}, workspace: {id,name} | null }` using `getCurrentWorkspaceId()`. Extend the profile route from Task 4 with a GET. Then the settings page fetches `/api/profile` for both current values.

So: FIRST extend `apps/web/src/app/api/profile/route.ts` (from Task 4) with a GET:
```ts
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
// ...add below the PATCH:
export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!
  const [me] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1)
  const workspaceId = await getCurrentWorkspaceId()
  let workspace: { id: string; name: string } | null = null
  if (workspaceId) {
    const [w] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    workspace = w ?? null
  }
  return NextResponse.json({ user: me ?? null, workspace })
}
```
(Add `workspaces` to the `@arago/db/schema` import and `getCurrentWorkspaceId` import in that file. NOTE: GET only reads the caller's own user + the active workspace name — no PII of others.)

Then create `apps/web/src/app/(app)/settings/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [wsId, setWsId] = useState<string | null>(null)
  const [wsName, setWsName] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then(({ user, workspace }) => {
        setName(user?.name ?? '')
        setWsId(workspace?.id ?? null)
        setWsName(workspace?.name ?? '')
      })
      .catch(() => {})
  }, [])

  async function saveProfile() {
    setStatus('')
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setStatus(res.ok ? 'Profil tersimpan.' : 'Gagal menyimpan profil.')
  }

  async function saveWorkspace() {
    if (!wsId) return
    setStatus('')
    const res = await fetch(`/api/workspaces/${wsId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wsName }),
    })
    setStatus(res.ok ? 'Workspace tersimpan.' : 'Gagal menyimpan workspace (perlu peran guru/owner).')
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">Pengaturan</h1>

      <section className="space-y-2">
        <label htmlFor="profile-name" className="block text-sm font-medium text-neutral-700">Nama</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
        <button onClick={saveProfile} disabled={!name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Simpan Profil</button>
      </section>

      <section className="space-y-2">
        <label htmlFor="ws-name" className="block text-sm font-medium text-neutral-700">Nama Workspace</label>
        <input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!wsId} className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400 disabled:opacity-50" />
        <button onClick={saveWorkspace} disabled={!wsId || !wsName.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Simpan Workspace</button>
      </section>

      {status && <p className="text-sm text-neutral-600">{status}</p>}
    </div>
  )
}
```

- [ ] **Step 2: add Settings to the sidebar nav**

In `apps/web/src/components/sidebar.tsx`, add to `NAV_ITEMS` after Kelas:
```tsx
  { href: '/settings', label: 'Pengaturan' },
```

- [ ] **Step 3: typecheck + build**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK; `/settings`, `/api/profile`, `/api/workspaces/[id]` at correct paths. (typedRoutes is ON from Slice 12 — the new `/settings` Link must typecheck; it's a static route so it will.)

- [ ] **Step 4: commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx" apps/web/src/app/api/profile/route.ts apps/web/src/components/sidebar.tsx
git commit -m "feat(web): /settings page (profile + workspace rename) + nav + GET /api/profile"
```

---

## Task 7: Results-page access messaging + chat/tutor scroll & a11y

**Files:**
- Modify: `apps/web/src/app/(app)/classes/[id]/results/page.tsx`
- Modify: `apps/web/src/components/material-chat.tsx`
- Modify: `apps/web/src/components/tutor-chat.tsx`

- [ ] **Step 1: results page — distinguish 403 from 404**

In `apps/web/src/app/(app)/classes/[id]/results/page.tsx`, the fetch currently maps all errors to "tidak ditemukan". Track the status. Change the fetch handling to set an error kind:
```tsx
const [errKind, setErrKind] = useState<'none' | 'forbidden' | 'notfound'>('none')
// in the effect:
fetch(`/api/classes/${id}/results`)
  .then((r) => {
    if (r.ok) return r.json()
    setErrKind(r.status === 403 ? 'forbidden' : 'notfound')
    return Promise.reject(r)
  })
  .then((data) => { setCls(data.class); setAssignments(data.assignments ?? []); setStudents(data.students ?? []); setSubs(data.submissions ?? []) })
  .catch(() => {})
  .finally(() => setLoading(false))
```
And in render, before the `!cls` branch:
```tsx
if (errKind === 'forbidden') {
  return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Anda tidak punya akses ke hasil kelas ini.</div>
}
```
(Keep the existing `!cls` → "Kelas tidak ditemukan" for the notfound case.)

- [ ] **Step 2: chat + tutor scroll-to-bottom**

In BOTH `apps/web/src/components/material-chat.tsx` and `apps/web/src/components/tutor-chat.tsx`:
- Add `import { useEffect, useRef } from 'react'` (merge with existing react imports).
- Add a ref on the scrollable messages container: `const listRef = useRef<HTMLDivElement>(null)`. Put `ref={listRef}` on the `overflow-y-auto` messages `<div>`.
- Add an effect that scrolls to bottom when `messages` changes:
```tsx
useEffect(() => {
  if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
}, [messages])
```

- [ ] **Step 3: chat + tutor input a11y**

In BOTH components, give the text input an associated label. Add before the `<input>`:
```tsx
<label htmlFor="chat-input" className="sr-only">Pesan</label>
```
and `id="chat-input"` on the input (use `id="tutor-input"` + matching `htmlFor` in tutor-chat.tsx to keep ids unique). Add `aria-label` to the send button (e.g. `aria-label="Kirim pesan"`) and, in material-chat, `aria-label` to each suggestion chip (e.g. `aria-label={\`Saran: ${c}\`}`).

- [ ] **Step 4: typecheck + build + tests**

Run:
```bash
rm -rf apps/web/.next && pnpm --filter @arago/web typecheck && pnpm --filter @arago/web test
```
Expected: PASS (existing `extractRevisedHtml` tests still green).

- [ ] **Step 5: commit**

```bash
git add "apps/web/src/app/(app)/classes/[id]/results/page.tsx" apps/web/src/components/material-chat.tsx apps/web/src/components/tutor-chat.tsx
git commit -m "feat(web): results 403/404 messaging; chat/tutor scroll-to-bottom + input a11y"
```

---

## Definition of Done

- [ ] `pnpm -r typecheck` all pass; `pnpm --filter @arago/web test` green.
- [ ] `next build` succeeds (typedRoutes on); new routes at correct paths.
- [ ] correctCount column applied to the local DB (or flagged pending).
- [ ] Manual (real env): settings renames profile + workspace; assignment window time round-trips correctly (type 08:00 → see 08:00); results page shows "X dari N benar"; non-teacher hitting a results URL sees the access message; chat/tutor auto-scroll.

## Self-review notes
- Spec coverage (Slice 13): /settings + rename ✓ (T4-T6), datetime fix ✓ (T3), correctCount ✓ (T1-T2), results messaging ✓ (T7), chat scroll+a11y ✓ (T7).
- Security: `/api/profile` PATCH updates only own row, name only (no email/role/passwordHash in schema); workspace rename `requireWorkspaceTeacher(id)` + uuid-guard; GET /api/profile returns only caller's user + active workspace name.
- Note: the teacher class-detail page (and thus the "Lihat hasil" link) is already only reachable by teachers because `GET /api/classes/[id]` is `requireWorkspaceTeacher`-gated (Slice 9); this slice adds the results-page access message for anyone reaching the URL directly.
- Type consistency: `correctCount` nullable int across schema + submit + results type; profile route returns `{user,workspace}` matching the settings page.
