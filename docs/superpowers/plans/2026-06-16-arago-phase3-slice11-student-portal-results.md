# Phase 3 Slice 11 — Student Class Portal + Results Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip student content access from workspace-wide to class-enrolled, give students a class portal (enrolled classes + active tasks + class view), and give teachers a per-class results dashboard.

**Architecture:** Re-scope `/api/student/materials/[id]` and `/api/ai/tutor` from `workspaceMembers` to `classMaterials` + `classEnrollments` (student must be enrolled in a class that includes the material). Rebuild the student dashboard (server component) to list enrolled classes + active assignments. Add a class-view page (client) backed by `GET /api/student/classes/[id]`. Add a teacher results dashboard (client) backed by `GET /api/classes/[id]/results`.

**Tech Stack:** Drizzle ORM, Next 15 (server components + route handlers + client pages), Vitest.

**Security invariants:** student read/tutor scope by `classEnrollments` (NOT `workspaceMembers`, NOT teacher cookie); published + not-soft-deleted (material, module); results route workspace-scoped + teacher-only via class workspace; never leak cross-class/cross-workspace data.

---

## File Structure

- Modify `apps/web/src/app/api/student/materials/[id]/route.ts` — rescope to enrollment.
- Modify `apps/web/src/app/api/ai/tutor/route.ts` — rescope to enrollment.
- Create `apps/web/src/app/api/student/classes/[id]/route.ts` — GET class view (enrollment-scoped).
- Modify `apps/web/src/app/(student)/student/page.tsx` — enrolled classes + active assignments.
- Create `apps/web/src/app/(student)/student/classes/[id]/page.tsx` — class view.
- Create `apps/web/src/app/api/classes/[id]/results/route.ts` — GET results matrix.
- Create `apps/web/src/app/(app)/classes/[id]/results/page.tsx` — teacher results dashboard.

---

## Task 1: Re-scope `/api/student/materials/[id]` to enrollment

**Files:**
- Modify: `apps/web/src/app/api/student/materials/[id]/route.ts`

- [ ] **Step 1: replace the workspaceMembers join with class enrollment**

A student may read a material only if enrolled in a class whose `classMaterials` includes it. Replace the ENTIRE file `apps/web/src/app/api/student/materials/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, classMaterials, classes, classEnrollments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const [material] = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      content: teachingMaterials.content,
    })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(classMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .innerJoin(classes, eq(classes.id, classMaterials.classId))
    .innerJoin(
      classEnrollments,
      and(eq(classEnrollments.classId, classes.id), eq(classEnrollments.studentId, session.user.id)),
    )
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
        isNull(classes.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json({ material })
}
```

- [ ] **Step 2: Typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/student/materials/[id]/route.ts"
git commit -m "feat(web): scope student material read to class enrollment (was workspaceMembers)"
```

---

## Task 2: Re-scope `/api/ai/tutor` to enrollment

**Files:**
- Modify: `apps/web/src/app/api/ai/tutor/route.ts`

- [ ] **Step 1: replace the workspaceMembers join with class enrollment**

Replace the ENTIRE file `apps/web/src/app/api/ai/tutor/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, classMaterials, classes, classEnrollments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { streamTutor } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  materialId: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, messages } = parsed.data

  // Enrollment-scoped re-fetch of the published material. Never trust client content.
  const [material] = await db
    .select({ content: teachingMaterials.content })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(classMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .innerJoin(classes, eq(classes.id, classMaterials.classId))
    .innerJoin(
      classEnrollments,
      and(eq(classEnrollments.classId, classes.id), eq(classEnrollments.studentId, session.user.id)),
    )
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
        isNull(classes.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (!material.content) {
    return NextResponse.json({ error: 'Material has no content' }, { status: 422 })
  }

  const result = streamTutor({ materialContent: material.content, messages })
  return result.toDataStreamResponse()
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/ai/tutor/route.ts
git commit -m "feat(web): scope AI tutor to class enrollment (was workspaceMembers)"
```

---

## Task 3: Student dashboard — enrolled classes + active assignments

**Files:**
- Modify: `apps/web/src/app/(student)/student/page.tsx`

- [ ] **Step 1: rewrite the dashboard (server component)**

List the student's enrolled classes, and active assignments (open now, before due, not yet submitted) across those classes. Replace the ENTIRE file `apps/web/src/app/(student)/student/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import {
  classes,
  classEnrollments,
  classAssignments,
  assessments,
  submissions,
} from '@arago/db/schema'
import { eq, isNull, and, inArray, gte, lte, notInArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentDashboardPage() {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  // Enrolled, non-deleted classes.
  const enrolledClasses = await db
    .select({ id: classes.id, name: classes.name })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(and(eq(classEnrollments.studentId, session.user.id), isNull(classes.deletedAt)))

  const classIds = enrolledClasses.map((c) => c.id)

  // Submissions already made by this student (to exclude from active list).
  const mySubs = await db
    .select({ assignmentId: submissions.assignmentId })
    .from(submissions)
    .where(eq(submissions.studentId, session.user.id))
  const submittedIds = mySubs.map((s) => s.assignmentId)

  const now = new Date()
  const activeAssignments =
    classIds.length === 0
      ? []
      : await db
          .select({
            id: classAssignments.id,
            classId: classAssignments.classId,
            dueAt: classAssignments.dueAt,
            assessmentTitle: assessments.title,
          })
          .from(classAssignments)
          .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
          .where(
            and(
              inArray(classAssignments.classId, classIds),
              isNull(classAssignments.deletedAt),
              isNull(assessments.deletedAt),
              eq(assessments.status, 'published'),
              lte(classAssignments.openAt, now),
              gte(classAssignments.dueAt, now),
              submittedIds.length > 0
                ? notInArray(classAssignments.id, submittedIds)
                : undefined,
            ),
          )

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Kelas Saya</h2>
        {enrolledClasses.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum terdaftar di kelas mana pun.</p>
        ) : (
          <ul className="space-y-2">
            {enrolledClasses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/student/classes/${c.id}`}
                  className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800 transition-colors"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Tugas Aktif</h2>
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-neutral-400">Tidak ada tugas aktif.</p>
        ) : (
          <ul className="space-y-3">
            {activeAssignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/student/assessments/${a.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <span className="font-medium text-neutral-900">{a.assessmentTitle}</span>
                  <span className="text-xs text-neutral-500">Tenggat {new Date(a.dueAt).toLocaleString('id-ID')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

(Note: `drizzle-orm`'s `and(...)` ignores `undefined` arguments, so the conditional `notInArray` is safe. The Bahan Ajar section from Slice 8/10 is removed — materials are now reached via the class view, Task 4.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(student)/student/page.tsx"
git commit -m "feat(web): student dashboard lists enrolled classes + active assignments"
```

---

## Task 4: Student class-view route + page

**Files:**
- Create: `apps/web/src/app/api/student/classes/[id]/route.ts`
- Create: `apps/web/src/app/(student)/student/classes/[id]/page.tsx`

- [ ] **Step 1: class-view route (enrollment-scoped)**

Returns the class + its assigned published materials + its assignments with the student's submission status. Create `apps/web/src/app/api/student/classes/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  classes,
  classEnrollments,
  classMaterials,
  classAssignments,
  teachingMaterials,
  teachingModules,
  assessments,
  submissions,
} from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  // Student must be enrolled in this non-deleted class.
  const [cls] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .innerJoin(
      classEnrollments,
      and(eq(classEnrollments.classId, classes.id), eq(classEnrollments.studentId, session.user.id)),
    )
    .where(and(eq(classes.id, id), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const materials = await db
    .select({ id: teachingMaterials.id, title: teachingMaterials.title })
    .from(classMaterials)
    .innerJoin(teachingMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(classMaterials.classId, id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
      ),
    )

  const assignmentRows = await db
    .select({
      id: classAssignments.id,
      openAt: classAssignments.openAt,
      dueAt: classAssignments.dueAt,
      assessmentTitle: assessments.title,
    })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(
      and(
        eq(classAssignments.classId, id),
        isNull(classAssignments.deletedAt),
        isNull(assessments.deletedAt),
        eq(assessments.status, 'published'),
      ),
    )

  const mySubs = await db
    .select({ assignmentId: submissions.assignmentId })
    .from(submissions)
    .where(eq(submissions.studentId, session.user.id))
  const submitted = new Set(mySubs.map((s) => s.assignmentId))

  const now = Date.now()
  const assignmentList = assignmentRows.map((a) => {
    let status: 'belum_dibuka' | 'aktif' | 'lewat' | 'selesai'
    if (submitted.has(a.id)) status = 'selesai'
    else if (now < new Date(a.openAt).getTime()) status = 'belum_dibuka'
    else if (now > new Date(a.dueAt).getTime()) status = 'lewat'
    else status = 'aktif'
    return { id: a.id, assessmentTitle: a.assessmentTitle, openAt: a.openAt, dueAt: a.dueAt, status }
  })

  return NextResponse.json({ class: cls, materials, assignments: assignmentList })
}
```

- [ ] **Step 2: class-view page (client)**

Create `apps/web/src/app/(student)/student/classes/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Material = { id: string; title: string }
type Assignment = { id: string; assessmentTitle: string; openAt: string; dueAt: string; status: string }
type ClassRow = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  belum_dibuka: 'Belum dibuka',
  aktif: 'Aktif',
  lewat: 'Lewat',
  selesai: 'Sudah dikumpulkan',
}

export default function StudentClassPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/student/classes/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setCls(data.class)
        setMaterials(data.materials ?? [])
        setAssignments(data.assignments ?? [])
      })
      .catch(() => setCls(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat kelas...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">{cls.name}</h1>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Bahan Ajar</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id}>
                <Link href={`/student/materials/${m.id}`} className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800">
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Asesmen</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada asesmen.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const clickable = a.status === 'aktif' || a.status === 'selesai'
              const inner = (
                <div className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg">
                  <span className="font-medium text-neutral-900">{a.assessmentTitle}</span>
                  <span className="text-xs text-neutral-500">{STATUS_LABEL[a.status] ?? a.status}</span>
                </div>
              )
              return (
                <li key={a.id}>
                  {clickable ? (
                    <Link href={`/student/assessments/${a.id}`} className="block hover:opacity-80">{inner}</Link>
                  ) : (
                    <div className="opacity-60">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/student/classes/[id]/route.ts" "apps/web/src/app/(student)/student/classes/[id]/page.tsx"
git commit -m "feat(web): student class view — materials + assignments with status (enrollment-scoped)"
```

---

## Task 5: Teacher results route

**Files:**
- Create: `apps/web/src/app/api/classes/[id]/results/route.ts`

- [ ] **Step 1: write the results route (workspace-scoped)**

Returns assignments, enrolled students, and the score matrix. Create `apps/web/src/app/api/classes/[id]/results/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  classes,
  classEnrollments,
  classAssignments,
  assessments,
  submissions,
  users,
} from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const [cls] = await db
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const assignments = await db
    .select({ id: classAssignments.id, assessmentTitle: assessments.title })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(and(eq(classAssignments.classId, id), isNull(classAssignments.deletedAt)))

  const students = await db
    .select({ studentId: classEnrollments.studentId, name: users.name, email: users.email })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .where(eq(classEnrollments.classId, id))

  const assignmentIds = assignments.map((a) => a.id)
  const subs =
    assignmentIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: submissions.assignmentId,
            studentId: submissions.studentId,
            score: submissions.score,
          })
          .from(submissions)
          .where(inArray(submissions.assignmentId, assignmentIds))

  return NextResponse.json({ class: cls, assignments, students, submissions: subs })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/classes/[id]/results/route.ts"
git commit -m "feat(web): GET /api/classes/[id]/results — score matrix (workspace-scoped)"
```

---

## Task 6: Teacher results dashboard page

**Files:**
- Create: `apps/web/src/app/(app)/classes/[id]/results/page.tsx`

- [ ] **Step 1: write the results page (client)**

Render a table: rows = enrolled students, columns = assignments, cells = score or "—". Create `apps/web/src/app/(app)/classes/[id]/results/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Assignment = { id: string; assessmentTitle: string }
type Student = { studentId: string; name: string; email: string }
type Sub = { assignmentId: string; studentId: string; score: number | null }
type ClassRow = { id: string; name: string }

export default function ClassResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/classes/${id}/results`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setCls(data.class)
        setAssignments(data.assignments ?? [])
        setStudents(data.students ?? [])
        setSubs(data.submissions ?? [])
      })
      .catch(() => setCls(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat hasil...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  const scoreOf = (studentId: string, assignmentId: string) => {
    const s = subs.find((x) => x.studentId === studentId && x.assignmentId === assignmentId)
    return s && s.score !== null ? String(s.score) : '—'
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Hasil — {cls.name}</h1>
      {students.length === 0 ? (
        <p className="text-sm text-neutral-400">Belum ada murid terdaftar.</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-neutral-600">Murid</th>
                {assignments.map((a) => (
                  <th key={a.id} className="text-center px-4 py-2 font-medium text-neutral-600">{a.assessmentTitle}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{s.name} <span className="text-neutral-400">{s.email}</span></td>
                  {assignments.map((a) => (
                    <td key={a.id} className="text-center px-4 py-2 text-neutral-700">{scoreOf(s.studentId, a.id)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: add a Hasil link on the class detail page**

In `apps/web/src/app/(app)/classes/[id]/page.tsx`, add a link to the results page near the class name section (after the `<section>` with the name input):

```tsx
<Link href={`/classes/${id}/results`} className="text-sm text-blue-600 hover:underline">
  Lihat hasil →
</Link>
```
Add `import Link from 'next/link'` at the top if not present.

- [ ] **Step 3: Typecheck + build (route validation — Phase 1 lesson)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK. Confirm at correct paths: `/student/classes/[id]`, `/classes/[id]/results`, `/api/student/classes/[id]`, `/api/classes/[id]/results`. No literal-backslash paths.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/classes/[id]/results/page.tsx" "apps/web/src/app/(app)/classes/[id]/page.tsx"
git commit -m "feat(web): teacher per-class results dashboard"
```

---

## Definition of Done

- [ ] `pnpm -r typecheck` all pass.
- [ ] `pnpm --filter @arago/web test` passes (existing tests still green).
- [ ] `next build` succeeds; new routes at correct paths; no `workspaceMembers` scoping left in `/api/student/materials/[id]` or `/api/ai/tutor`.
- [ ] Manual (real env): a student enrolled in a class with an assigned material can read it + use the tutor; a student NOT enrolled in any class containing that material gets 404 on read + tutor; student dashboard shows enrolled classes + active assignments; teacher results table shows score per student per assignment.

## Self-review notes
- Spec coverage (Slice 11): access narrowing ✓ (T1/T2), student dashboard classes+tasks ✓ (T3), class view ✓ (T4), results route+page ✓ (T5/T6).
- Security: student read/tutor now require `classEnrollments` + `classMaterials` (verify no `workspaceMembers` import remains in those two files); class view enrollment-scoped; results route workspace-scoped (teacher cookie) so a student/cross-workspace user cannot read it.
- Type consistency: class-view returns `{class, materials, assignments:[{id,assessmentTitle,openAt,dueAt,status}]}`; results returns `{class, assignments, students, submissions}`; active-assignment links use assignmentId → take page (Slice 10).
- Phase 2 regression check: the Phase 2 "workspace-wide student read" path is intentionally GONE — that is the approved class-scoped narrowing, not a bug.
