# Phase 4 Slice 14 — Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app notifications. When a teacher assigns an assessment to a class, every enrolled student gets a notification. A bell (in both portals) shows the unread count and a list, with mark-as-read.

**Architecture:** A `notifications` table keyed by `userId`. The assignment-create route emits one row per enrolled student (best-effort, never fails the assignment). User-scoped `GET /api/notifications` + `POST /api/notifications/read`. A `NotificationBell` client component mounted in both layouts.

**Tech Stack:** Drizzle, Zod, Next 15 route handlers + client component, Vitest.

**Security invariants:** every notification query/mutation filters `eq(notifications.userId, session.user.id)` — a user can only read/mark their own. UUID-guard the optional `id`.

---

## File Structure

- Modify `packages/db/src/schema/index.ts` — `notifications` table + relation + index.
- Modify `apps/web/src/app/api/classes/[id]/assignments/route.ts` — emit on create.
- Create `apps/web/src/app/api/notifications/route.ts` — GET list + unread count.
- Create `apps/web/src/app/api/notifications/read/route.ts` — POST mark read.
- Create `apps/web/src/components/notification-bell.tsx` — bell UI.
- Modify `apps/web/src/app/(app)/layout.tsx` + `(student)/layout.tsx` — mount the bell.

---

## Task 1: `notifications` schema

**Files:**
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: add the table + relation + index**

In `packages/db/src/schema/index.ts`, after the classes tables (before Relations), add. Ensure `index` is imported from `drizzle-orm/pg-core` (add to the import list):

```ts
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 50 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    linkPath: text("link_path"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)]
);
```

And a relation at the end of the file:
```ts
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] })
}));
```

- [ ] **Step 2: apply to local DB (non-interactive)**

Run (NOT `db:push` — interactive TUI):
```bash
pnpm --filter @arago/db exec drizzle-kit generate --name add_notifications </dev/null
docker exec -i arago-postgres psql -U arago -d arago -v ON_ERROR_STOP=1 < packages/db/drizzle/$(ls -t packages/db/drizzle/*.sql | head -1 | xargs basename)
```
Expected: `CREATE TABLE "notifications"` + index. (If docker DB not up, `docker compose up -d`; if still unreachable, flag DONE_WITH_CONCERNS — schema + code land, live apply pending.)

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @arago/db typecheck`
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add packages/db/src/schema/index.ts packages/db/drizzle
git commit -m "feat(db): notifications table (userId, type, message, linkPath, readAt)"
```

---

## Task 2: Emit notifications on assignment create

**Files:**
- Modify: `apps/web/src/app/api/classes/[id]/assignments/route.ts`

- [ ] **Step 1: insert notifications for enrolled students after the assignment is created**

In the POST handler, after the `classAssignments` insert returns `created` and before the response, add a best-effort emit. The handler already has `id` (classId) and the validated assessment; it needs the assessment title and the enrolled students. Add imports `classEnrollments`, `assessments` (assessments already imported), `notifications` to the `@arago/db/schema` import.

After `const [created] = await db.insert(classAssignments)...returning()` (and its null check if present), add:

```ts
  // Best-effort: notify enrolled students. Must not fail assignment creation.
  if (created) {
    try {
      const [a] = await db
        .select({ title: assessments.title })
        .from(assessments)
        .where(eq(assessments.id, created.assessmentId))
        .limit(1)
      const enrolled = await db
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .where(eq(classEnrollments.classId, id))
      if (enrolled.length > 0) {
        await db.insert(notifications).values(
          enrolled.map((e) => ({
            userId: e.studentId,
            type: 'assignment',
            message: `Asesmen baru: ${a?.title ?? 'Asesmen'}`,
            linkPath: `/student/assessments/${created.id}`,
          })),
        )
      }
    } catch {
      // swallow — notification failure must not break assignment creation
    }
  }
```

- [ ] **Step 2: typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add "apps/web/src/app/api/classes/[id]/assignments/route.ts"
git commit -m "feat(web): emit notifications to enrolled students on assignment create"
```

---

## Task 3: `GET /api/notifications`

**Files:**
- Create: `apps/web/src/app/api/notifications/route.ts`

- [ ] **Step 1: write the route (user-scoped)**

Create `apps/web/src/app/api/notifications/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { notifications } from '@arago/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const recent = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(20)

  const unread = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))

  return NextResponse.json({ notifications: recent, unreadCount: unread.length })
}
```

- [ ] **Step 2: typecheck + commit**

Run: `pnpm --filter @arago/web typecheck` → PASS.
```bash
git add apps/web/src/app/api/notifications/route.ts
git commit -m "feat(web): GET /api/notifications — own recent + unread count"
```

---

## Task 4: `POST /api/notifications/read`

**Files:**
- Create: `apps/web/src/app/api/notifications/read/route.ts`

- [ ] **Step 1: write the route**

🔒 Marks the caller's own notifications read — one by `id` (ownership-scoped) or all. Create `apps/web/src/app/api/notifications/read/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { notifications } from '@arago/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const bodySchema = z.object({ id: z.string().uuid().optional() })

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const now = new Date()
  if (parsed.data.id) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, parsed.data.id), eq(notifications.userId, session.user.id)))
  } else {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: typecheck + commit**

Run: `pnpm --filter @arago/web typecheck` → PASS.
```bash
git add apps/web/src/app/api/notifications/read/route.ts
git commit -m "feat(web): POST /api/notifications/read — mark one (own) or all read"
```

---

## Task 5: `NotificationBell` component

**Files:**
- Create: `apps/web/src/components/notification-bell.tsx`

- [ ] **Step 1: write the component**

Create `apps/web/src/components/notification-bell.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Notif = { id: string; type: string; message: string; linkPath: string | null; readAt: string | null; createdAt: string }

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const { notifications, unreadCount } = await res.json()
      setItems(notifications ?? [])
      setUnread(unreadCount ?? 0)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function markAll() {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    await load()
  }

  async function openItem(n: Notif) {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    })
    setOpen(false)
    await load()
    if (n.linkPath) router.push(n.linkPath as never)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
        className="relative rounded-md p-2 text-neutral-600 hover:bg-neutral-100"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
            <span className="text-sm font-semibold text-neutral-800">Notifikasi</span>
            <button type="button" onClick={markAll} className="text-xs text-blue-600 hover:underline">Tandai dibaca</button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-neutral-400">Tidak ada notifikasi.</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={[
                      'block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50',
                      n.readAt ? 'text-neutral-500' : 'font-medium text-neutral-900',
                    ].join(' ')}
                  >
                    {n.message}
                    <span className="block text-xs text-neutral-400">{new Date(n.createdAt).toLocaleString('id-ID')}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
```

(Note: `router.push(n.linkPath as never)` — with typedRoutes ON, a runtime string isn't a typed `Route`; `as never` is avoided — use `as Route` instead. Add `import { type Route } from 'next'` and `router.push(n.linkPath as Route)`.)

- [ ] **Step 2: fix the cast to `as Route`**

Ensure the file imports `import { type Route } from 'next'` and uses `router.push(n.linkPath as Route)` (not `as never`).

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 4: commit**

```bash
git add apps/web/src/components/notification-bell.tsx
git commit -m "feat(web): NotificationBell component (unread badge, list, mark-read)"
```

---

## Task 6: Mount the bell in both layouts

**Files:**
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/(student)/layout.tsx`

- [ ] **Step 1: teacher layout**

In `apps/web/src/app/(app)/layout.tsx`, import the bell and render it in the main content header area. Since the layout has a sidebar + `<main>`, add a thin top bar inside `<main>`. Add `import { NotificationBell } from '@/components/notification-bell'` and wrap the children:

Replace:
```tsx
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
```
with:
```tsx
      <main className="flex-1 overflow-y-auto">
        <div className="flex justify-end border-b border-gray-200 bg-white px-6 py-2">
          <NotificationBell />
        </div>
        <div className="p-6">{children}</div>
      </main>
```

- [ ] **Step 2: student layout**

In `apps/web/src/app/(student)/layout.tsx`, import the bell and render it in the header's right-side flex group, before the name/keluar. Add `import { NotificationBell } from '@/components/notification-bell'` and insert `<NotificationBell />` as the first child of the `<div className="flex items-center gap-4">`.

- [ ] **Step 3: typecheck + build (route validation)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK; `/api/notifications`, `/api/notifications/read` at correct paths.

- [ ] **Step 4: commit**

```bash
git add "apps/web/src/app/(app)/layout.tsx" "apps/web/src/app/(student)/layout.tsx"
git commit -m "feat(web): mount NotificationBell in teacher + student layouts"
```

---

## Definition of Done

- [ ] `pnpm -r typecheck` all pass; `pnpm --filter @arago/web test` green.
- [ ] `next build` succeeds; notification routes at correct paths.
- [ ] notifications table applied to local DB (or flagged pending).
- [ ] Manual (real env): teacher assigns an assessment → enrolled student's bell shows unread badge → clicking the item opens the take page and marks it read; "Tandai dibaca" clears the badge; a user never sees another user's notifications.

## Self-review notes
- Spec coverage (Slice 14): table ✓ (T1), emit on assignment-create ✓ (T2), GET + read routes ✓ (T3-T4), bell in both layouts ✓ (T5-T6).
- Security: every notification query/update filters `userId = session.user.id`; mark-one is ownership-scoped (`and(id, userId)`); optional `id` UUID-validated. Emit is best-effort (try/catch) so it cannot break assignment creation.
- typedRoutes: the bell's runtime `linkPath` push uses `as Route` (Slice 12 is ON).
- Type consistency: bell `Notif` shape matches the notifications row; GET returns `{notifications, unreadCount}`; read POST body `{id?}`.
