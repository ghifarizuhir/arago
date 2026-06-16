# Phase 3 Slice 10 — Assignments + Take-by-Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers assign a published assessment to a class with an open/due window; `submissions` migrates to `assignmentId`; the student take/submit/results flow moves to `assignmentId` with enrollment + window enforcement.

**Architecture:** Migrate `submissions.assessmentId → assignmentId` (dev DB, destructive `db:push`). Add `classAssignments` write routes (workspace-scoped, validate the assessment is in-workspace + published, `dueAt > openAt`). Rework `POST /api/student/submissions` to take `assignmentId` and enforce enrollment + `[openAt, dueAt]` server-side. Add `GET /api/student/assignments/[id]` (enrollment-scoped, items WITHOUT correctAnswer) for the take page, and extend `GET /api/student/submissions/[id]` to return the assessment items WITH correctAnswer for the results pembahasan. Re-key the student take + results pages from assessmentId to assignmentId, and remove the now-stale workspace-wide assessment list from the student dashboard.

**Tech Stack:** Drizzle ORM, Zod, Next 15 route handlers + client pages, `@arago/ai` `gradeSubmission`, Vitest.

**Security invariants:** student submit/read routes scope by `classEnrollments` (not the teacher cookie, not `workspaceMembers`); never trust client score/ids; enforce window + published + not-soft-deleted (assignment, class, assessment) server-side; double-submit `(assignmentId, studentId)` → 409.

---

## File Structure

- Modify `packages/db/src/schema/index.ts` — `submissions`: `assessmentId` → `assignmentId`; update `submissionsRelations`.
- Modify `packages/validators/src/index.ts` + test — `CreateAssignmentSchema`.
- Create `apps/web/src/app/api/classes/[id]/assignments/route.ts` — POST create assignment.
- Create `apps/web/src/app/api/classes/[id]/assignments/[assignmentId]/route.ts` — DELETE soft-delete.
- Rewrite `apps/web/src/app/api/student/submissions/route.ts` — POST by `assignmentId`.
- Create `apps/web/src/app/api/student/assignments/[id]/route.ts` — GET take payload (enrollment-scoped).
- Modify `apps/web/src/app/api/student/submissions/[id]/route.ts` — include assessment title + items (with correctAnswer).
- Modify `apps/web/src/app/(app)/classes/[id]/page.tsx` — add Asesmen (assignments) section.
- Modify `apps/web/src/app/(student)/student/assessments/[id]/page.tsx` — take by assignmentId.
- Modify `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx` — results by assignmentId/submissionId.
- Modify `apps/web/src/app/(student)/student/page.tsx` — remove stale assessment list.

---

## Task 1: Migrate `submissions` to `assignmentId`

**Files:**
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Change the column + reference**

In `packages/db/src/schema/index.ts`, in the `submissions` table, replace the `assessmentId` field with `assignmentId`:

Find:
```ts
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id),
```
Replace with:
```ts
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => classAssignments.id),
```

- [ ] **Step 2: Update the submissions relation**

In `submissionsRelations`, replace the `assessment` relation with `assignment`:

Find:
```ts
export const submissionsRelations = relations(submissions, ({ one }) => ({
  assessment: one(assessments, {
    fields: [submissions.assessmentId],
    references: [assessments.id]
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id]
  })
}));
```
Replace with:
```ts
export const submissionsRelations = relations(submissions, ({ one }) => ({
  assignment: one(classAssignments, {
    fields: [submissions.assignmentId],
    references: [classAssignments.id]
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id]
  })
}));
```

Also remove `submissions` from `assessmentsRelations` (it no longer references assessments directly):
Find the line `    submissions: many(submissions)` inside `assessmentsRelations` and delete that line (and fix the trailing comma on the preceding `items: many(assessmentItems)` line so it has no dangling comma).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arago/db typecheck`
Expected: PASS. (`classAssignments` already exists from Slice 9.)

- [ ] **Step 4: Push schema (dev DB)**

Run: `pnpm --filter @arago/db db:push`
Expected: drizzle-kit drops `submissions.assessment_id`, adds `submissions.assignment_id` FK → `class_assignments`. Destructive (dev, no data). If no dev DB, flag DONE_WITH_CONCERNS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/index.ts
git commit -m "feat(db): migrate submissions.assessmentId -> assignmentId (class assignment)"
```

---

## Task 2: `CreateAssignmentSchema` validator

**Files:**
- Modify: `packages/validators/src/index.ts`
- Test: `packages/validators/src/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/validators/src/index.test.ts`:

```ts
import { CreateAssignmentSchema } from "./index";

describe("CreateAssignmentSchema", () => {
  const base = {
    assessmentId: "33333333-3333-3333-3333-333333333333",
    openAt: "2026-07-01T08:00:00.000Z",
    dueAt: "2026-07-08T08:00:00.000Z",
  };
  it("accepts a valid assignment with dueAt after openAt", () => {
    expect(CreateAssignmentSchema.safeParse(base).success).toBe(true);
  });
  it("rejects dueAt before or equal to openAt", () => {
    expect(
      CreateAssignmentSchema.safeParse({ ...base, dueAt: base.openAt }).success,
    ).toBe(false);
  });
  it("rejects a non-uuid assessmentId", () => {
    expect(
      CreateAssignmentSchema.safeParse({ ...base, assessmentId: "nope" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arago/validators test -- -t "CreateAssignmentSchema"`
Expected: FAIL — schema not exported.

- [ ] **Step 3: Add the schema**

In `packages/validators/src/index.ts`, after the class schemas, add. `z.coerce.date()` parses ISO strings (from `datetime-local`/JSON) into `Date`; `.refine` enforces ordering:

```ts
export const CreateAssignmentSchema = z
  .object({
    assessmentId: uuidSchema,
    openAt: z.coerce.date(),
    dueAt: z.coerce.date()
  })
  .refine((v) => v.dueAt > v.openAt, {
    message: "dueAt must be after openAt",
    path: ["dueAt"]
  });
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arago/validators test`
Expected: PASS (Slice 9's 34 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/index.ts packages/validators/src/index.test.ts
git commit -m "feat(validators): CreateAssignmentSchema (dueAt > openAt)"
```

---

## Task 3: Assignment routes (create + soft-delete)

**Files:**
- Create: `apps/web/src/app/api/classes/[id]/assignments/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/assignments/[assignmentId]/route.ts`

- [ ] **Step 1: create route (POST)**

🔒 Validate the class is in this workspace AND the assessment is in this workspace + published. Create `apps/web/src/app/api/classes/[id]/assignments/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classAssignments, assessments } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { CreateAssignmentSchema } from '@arago/validators'
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
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const rows = await db
    .select({
      id: classAssignments.id,
      assessmentId: classAssignments.assessmentId,
      openAt: classAssignments.openAt,
      dueAt: classAssignments.dueAt,
      assessmentTitle: assessments.title,
    })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(and(eq(classAssignments.classId, id), isNull(classAssignments.deletedAt)))
    .orderBy(desc(classAssignments.createdAt))

  return NextResponse.json({ assignments: rows })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = CreateAssignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // assessment must be in THIS workspace AND published, not soft-deleted.
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        eq(assessments.id, parsed.data.assessmentId),
        eq(assessments.workspaceId, workspaceId),
        eq(assessments.status, 'published'),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)
  if (!assessment) {
    return NextResponse.json(
      { error: 'Assessment is not a published assessment in this workspace' },
      { status: 422 },
    )
  }

  const [created] = await db
    .insert(classAssignments)
    .values({
      classId: id,
      assessmentId: parsed.data.assessmentId,
      openAt: parsed.data.openAt,
      dueAt: parsed.data.dueAt,
    })
    .returning()

  return NextResponse.json({ assignment: created }, { status: 201 })
}
```

- [ ] **Step 2: soft-delete route (DELETE)**

Create `apps/web/src/app/api/classes/[id]/assignments/[assignmentId]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classAssignments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; assignmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id, assignmentId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(assignmentId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  // class must be in workspace; assignment must belong to the class.
  const [row] = await db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .innerJoin(classes, eq(classAssignments.classId, classes.id))
    .where(
      and(
        eq(classAssignments.id, assignmentId),
        eq(classAssignments.classId, id),
        eq(classes.workspaceId, workspaceId),
        isNull(classes.deletedAt),
        isNull(classAssignments.deletedAt),
      ),
    )
    .limit(1)
  if (!row) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  await db.update(classAssignments).set({ deletedAt: new Date() }).where(eq(classAssignments.id, assignmentId))

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/classes/[id]/assignments/route.ts" "apps/web/src/app/api/classes/[id]/assignments/[assignmentId]/route.ts"
git commit -m "feat(web): class assignment routes (create validated in-workspace published, soft-delete)"
```

---

## Task 4: Rework `POST /api/student/submissions` to assignmentId

**Files:**
- Rewrite: `apps/web/src/app/api/student/submissions/route.ts`

- [ ] **Step 1: rewrite the route**

🔒 Enrollment + window + published + double-submit, all server-side. Replace the ENTIRE file `apps/web/src/app/api/student/submissions/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  assessments,
  assessmentItems,
  classAssignments,
  classEnrollments,
  classes,
  submissions,
} from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { gradeSubmission } from '@arago/ai/grading'
import { z } from 'zod'

const bodySchema = z.object({
  assignmentId: z.string().uuid(),
  answers: z.record(z.string(), z.string()),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { assignmentId, answers } = parsed.data

  // Resolve the assignment + its class + assessment; assignment & class not soft-deleted, assessment published.
  const [row] = await db
    .select({
      assignmentId: classAssignments.id,
      classId: classAssignments.classId,
      assessmentId: classAssignments.assessmentId,
      openAt: classAssignments.openAt,
      dueAt: classAssignments.dueAt,
      status: assessments.status,
    })
    .from(classAssignments)
    .innerJoin(classes, eq(classAssignments.classId, classes.id))
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(
      and(
        eq(classAssignments.id, assignmentId),
        isNull(classAssignments.deletedAt),
        isNull(classes.deletedAt),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Student must be enrolled in the assignment's class.
  const [enrollment] = await db
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(
      and(eq(classEnrollments.classId, row.classId), eq(classEnrollments.studentId, session.user.id)),
    )
    .limit(1)
  if (!enrollment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  if (row.status !== 'published') {
    return NextResponse.json({ error: 'Assessment is not published' }, { status: 422 })
  }

  // Window enforcement (server-side).
  const now = new Date()
  if (now < row.openAt) {
    return NextResponse.json({ error: 'Asesmen belum dibuka' }, { status: 403 })
  }
  if (now > row.dueAt) {
    return NextResponse.json({ error: 'Batas waktu sudah lewat' }, { status: 403 })
  }

  // Double-submit guard.
  const [existing] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, session.user.id)))
    .limit(1)
  if (existing) {
    return NextResponse.json({ error: 'Already submitted', submissionId: existing.id }, { status: 409 })
  }

  const items = await db
    .select({ id: assessmentItems.id, correctAnswer: assessmentItems.correctAnswer })
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, row.assessmentId))

  const { score, totalItems } = gradeSubmission(items, answers)

  const [submission] = await db
    .insert(submissions)
    .values({
      assignmentId,
      studentId: session.user.id,
      answers,
      score,
      totalItems,
      submittedAt: now,
      gradedAt: now,
    })
    .returning()

  if (!submission) {
    return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
  }

  return NextResponse.json({ submissionId: submission.id, score, totalItems }, { status: 201 })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/student/submissions/route.ts
git commit -m "feat(web): submit by assignmentId — enrollment + open/due window + server grade"
```

---

## Task 5: `GET /api/student/assignments/[id]` (take payload)

**Files:**
- Create: `apps/web/src/app/api/student/assignments/[id]/route.ts`

- [ ] **Step 1: write the route**

🔒 Enrollment-scoped. Returns the assignment window + assessment meta + items WITHOUT `correctAnswer`. Create `apps/web/src/app/api/student/assignments/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  assessments,
  assessmentItems,
  classAssignments,
  classEnrollments,
  classes,
} from '@arago/db/schema'
import { eq, isNull, and, asc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Assignment + class + assessment, scoped by enrollment of the current student.
  const [row] = await db
    .select({
      assignmentId: classAssignments.id,
      openAt: classAssignments.openAt,
      dueAt: classAssignments.dueAt,
      assessmentId: assessments.id,
      assessmentTitle: assessments.title,
      assessmentStatus: assessments.status,
    })
    .from(classAssignments)
    .innerJoin(classes, eq(classAssignments.classId, classes.id))
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .innerJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
    .where(
      and(
        eq(classAssignments.id, id),
        eq(classEnrollments.studentId, session.user.id),
        isNull(classAssignments.deletedAt),
        isNull(classes.deletedAt),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  // Items WITHOUT correctAnswer (don't leak answers before submit).
  const items = await db
    .select({
      id: assessmentItems.id,
      question: assessmentItems.question,
      options: assessmentItems.options,
      sortOrder: assessmentItems.sortOrder,
    })
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, row.assessmentId))
    .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))

  return NextResponse.json({
    assignment: { id: row.assignmentId, openAt: row.openAt, dueAt: row.dueAt },
    assessment: { id: row.assessmentId, title: row.assessmentTitle, status: row.assessmentStatus },
    items,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/student/assignments/[id]/route.ts"
git commit -m "feat(web): GET /api/student/assignments/[id] — enrollment-scoped take payload (no correctAnswer)"
```

---

## Task 6: Extend submission detail for results pembahasan

**Files:**
- Modify: `apps/web/src/app/api/student/submissions/[id]/route.ts`

- [ ] **Step 1: include assessment title + items (with correctAnswer)**

The student owns the submission and has already submitted, so revealing correctAnswer here is the intended pembahasan. Resolve assignment → assessment → items. Replace the ENTIRE file `apps/web/src/app/api/student/submissions/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { submissions, classAssignments, assessments, assessmentItems } from '@arago/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const [submission] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.studentId, session.user.id)))
    .limit(1)

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Resolve assessment via the assignment.
  const [meta] = await db
    .select({ assessmentId: assessments.id, assessmentTitle: assessments.title })
    .from(classAssignments)
    .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
    .where(eq(classAssignments.id, submission.assignmentId))
    .limit(1)

  const items = meta
    ? await db
        .select({
          id: assessmentItems.id,
          question: assessmentItems.question,
          options: assessmentItems.options,
          correctAnswer: assessmentItems.correctAnswer,
          sortOrder: assessmentItems.sortOrder,
        })
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, meta.assessmentId))
        .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))
    : []

  return NextResponse.json({
    submission,
    assessmentTitle: meta?.assessmentTitle ?? '',
    items,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/student/submissions/[id]/route.ts"
git commit -m "feat(web): submission detail returns assessment title + items for pembahasan"
```

---

## Task 7: Teacher UI — assignments section in class detail

**Files:**
- Modify: `apps/web/src/app/(app)/classes/[id]/page.tsx`

- [ ] **Step 1: add assignments state + fetches + handlers**

In the class detail page (from Slice 9), add assignment support. Add these types near the other type aliases:

```tsx
type Assignment = { id: string; assessmentId: string; openAt: string; dueAt: string; assessmentTitle: string }
type Assessment = { id: string; title: string }
```

Add state (next to the others):
```tsx
const [assignments, setAssignments] = useState<Assignment[]>([])
const [wsAssessments, setWsAssessments] = useState<Assessment[]>([])
const [pickAssessment, setPickAssessment] = useState('')
const [openAt, setOpenAt] = useState('')
const [dueAt, setDueAt] = useState('')
```

Inside `load()` (after the class fetch), also load assignments:
```tsx
const aRes = await fetch(`/api/classes/${id}/assignments`)
if (aRes.ok) {
  const { assignments: as } = await aRes.json()
  setAssignments(as ?? [])
}
```

In the `useEffect`, fetch published workspace assessments for the picker (the existing `/api/assessments` returns workspace assessments; filter to published):
```tsx
fetch('/api/assessments')
  .then((r) => r.json())
  .then(({ assessments: a }: { assessments: { id: string; title: string; status: string }[] }) =>
    setWsAssessments((a ?? []).filter((x) => x.status === 'published').map((x) => ({ id: x.id, title: x.title }))),
  )
  .catch(() => setWsAssessments([]))
```

Add handlers:
```tsx
async function createAssignment() {
  if (!pickAssessment || !openAt || !dueAt) return
  const res = await fetch(`/api/classes/${id}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessmentId: pickAssessment, openAt, dueAt }),
  })
  if (res.ok) {
    setPickAssessment('')
    setOpenAt('')
    setDueAt('')
    await load()
  }
}

async function removeAssignment(assignmentId: string) {
  await fetch(`/api/classes/${id}/assignments/${assignmentId}`, { method: 'DELETE' })
  await load()
}
```

- [ ] **Step 2: render the Asesmen section**

Add a `<section>` after the Bahan Ajar section in the JSX:

```tsx
<section>
  <h2 className="text-lg font-semibold text-neutral-900 mb-3">Asesmen</h2>
  {assignments.length === 0 ? (
    <p className="text-sm text-neutral-400 mb-3">Belum ada asesmen yang ditugaskan.</p>
  ) : (
    <ul className="space-y-2 mb-4">
      {assignments.map((a) => (
        <li key={a.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
          <span className="text-sm text-neutral-800">
            {a.assessmentTitle}
            <span className="text-neutral-400"> · {new Date(a.openAt).toLocaleString('id-ID')} → {new Date(a.dueAt).toLocaleString('id-ID')}</span>
          </span>
          <button onClick={() => removeAssignment(a.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
        </li>
      ))}
    </ul>
  )}
  <div className="space-y-2 border border-neutral-200 rounded-lg p-3">
    <select
      value={pickAssessment}
      onChange={(e) => setPickAssessment(e.target.value)}
      className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm"
    >
      <option value="">Pilih asesmen...</option>
      {wsAssessments.map((a) => (
        <option key={a.id} value={a.id}>{a.title}</option>
      ))}
    </select>
    <div className="flex gap-2">
      <label className="flex-1 text-xs text-neutral-500">Buka
        <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm" />
      </label>
      <label className="flex-1 text-xs text-neutral-500">Tenggat
        <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm" />
      </label>
    </div>
    <button
      onClick={createAssignment}
      disabled={!pickAssessment || !openAt || !dueAt}
      className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
    >
      Tugaskan
    </button>
  </div>
</section>
```

(Note: `datetime-local` produces local-time strings like `2026-07-01T08:00`; `z.coerce.date()` on the server parses them. This is acceptable for the dev scope; timezone-precise handling is a Phase 4 polish item.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/classes/[id]/page.tsx"
git commit -m "feat(web): assign assessment to class with open/due window (teacher)"
```

---

## Task 8: Re-key student take page to assignmentId

**Files:**
- Modify: `apps/web/src/app/(student)/student/assessments/[id]/page.tsx`

- [ ] **Step 1: rewrite the take page**

The `[id]` route param is now an **assignmentId**. Fetch `/api/student/assignments/[id]`, submit `{ assignmentId, answers }`. Replace the ENTIRE file `apps/web/src/app/(student)/student/assessments/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; sortOrder: number }
type Assessment = { id: string; title: string; status: string }

export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>() // assignmentId
  const router = useRouter()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<AssessmentItem[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/student/assignments/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ assessment: a, items: its }: { assessment: Assessment; items: AssessmentItem[] }) => {
        setAssessment(a)
        setItems(its ?? [])
      })
      .catch(() => setAssessment(null))
      .finally(() => setLoading(false))
  }, [id])

  const handleAnswer = (itemId: string, choiceId: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: choiceId }))
  }

  const handleSubmit = async () => {
    if (Object.keys(answers).length < items.length) {
      const unanswered = items.length - Object.keys(answers).length
      if (!confirm(`Masih ada ${unanswered} soal yang belum dijawab. Lanjutkan?`)) return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/student/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId: id, answers }),
      })
      if (res.status === 409) {
        const data = await res.json()
        router.push(`/student/assessments/${id}/results?submissionId=${data.submissionId}`)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal mengumpulkan jawaban.')
        return
      }
      const { submissionId } = await res.json()
      router.push(`/student/assessments/${id}/results?submissionId=${submissionId}`)
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat soal...</div>
      </div>
    )
  }

  if (!assessment || assessment.status !== 'published') {
    return <div className="text-center py-16 text-neutral-400 text-sm">Asesmen tidak tersedia.</div>
  }

  const answeredCount = Object.keys(answers).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-neutral-900">{assessment.title}</h1>
        <span className="text-sm text-neutral-500">{answeredCount}/{items.length} dijawab</span>
      </div>

      <ol className="space-y-6 mb-8">
        {items.map((item, idx) => (
          <li key={item.id} className="bg-white border border-neutral-200 rounded-lg p-4">
            <p className="text-sm font-medium text-neutral-800 mb-3">{idx + 1}. {item.question}</p>
            <ul className="space-y-2">
              {item.options.map((opt, oi) => (
                <li key={opt.id}>
                  <label className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      name={`item-${item.id}`}
                      value={opt.id}
                      checked={answers[item.id] === opt.id}
                      onChange={() => handleAnswer(item.id, opt.id)}
                      className="text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-xs font-medium text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                    <span className="text-sm text-neutral-700">{opt.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {submitting ? 'Mengumpulkan...' : 'Kumpulkan Jawaban'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(student)/student/assessments/[id]/page.tsx"
git commit -m "feat(web): take page keyed by assignmentId, fetches enrollment-scoped payload"
```

---

## Task 9: Re-key results page + remove stale dashboard assessment list

**Files:**
- Modify: `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx`
- Modify: `apps/web/src/app/(student)/student/page.tsx`

- [ ] **Step 1: rewrite the results page**

The `[id]` param is now assignmentId. Results data comes entirely from `/api/student/submissions/[submissionId]` (extended in Task 6) — no `/api/assessments/[id]` call. Replace the ENTIRE file `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx`:

```tsx
'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; correctAnswer: string; sortOrder: number }
type Submission = { id: string; score: number; totalItems: number; answers: Record<string, string>; submittedAt: string }

function ResultsPageInner() {
  const { id } = useParams<{ id: string }>() // assignmentId
  const searchParams = useSearchParams()
  const router = useRouter()
  const submissionId = searchParams.get('submissionId')

  const [items, setItems] = useState<AssessmentItem[]>([])
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!submissionId) {
      router.replace(`/student/assessments/${id}`)
      return
    }
    fetch(`/api/student/submissions/${submissionId}`)
      .then((r) => r.json())
      .then(
        ({
          submission: sub,
          assessmentTitle: title,
          items: its,
        }: {
          submission: Submission
          assessmentTitle: string
          items: AssessmentItem[]
        }) => {
          setSubmission(sub)
          setAssessmentTitle(title ?? '')
          setItems(its ?? [])
        },
      )
      .finally(() => setLoading(false))
  }, [id, submissionId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat hasil...</div>
      </div>
    )
  }

  if (!submission) {
    return <div className="text-center py-16 text-neutral-400 text-sm">Hasil tidak ditemukan.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900">{assessmentTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Nilai: <span className="font-semibold text-neutral-900">{submission.score}</span> / 100 ·{' '}
          {submission.totalItems} soal
        </p>
      </div>

      <ol className="space-y-6 mb-8">
        {items.map((item, idx) => {
          const chosen = submission.answers[item.id]
          return (
            <li key={item.id} className="bg-white border border-neutral-200 rounded-lg p-4">
              <p className="text-sm font-medium text-neutral-800 mb-3">{idx + 1}. {item.question}</p>
              <ul className="space-y-2">
                {item.options.map((opt, oi) => {
                  const isCorrect = opt.id === item.correctAnswer
                  const isChosen = opt.id === chosen
                  return (
                    <li
                      key={opt.id}
                      className={[
                        'flex items-center gap-3 p-2 rounded-lg text-sm',
                        isCorrect ? 'bg-green-50 text-green-800' : isChosen ? 'bg-red-50 text-red-700' : 'text-neutral-700',
                      ].join(' ')}
                    >
                      <span className="text-xs font-medium text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                      <span>{opt.text}</span>
                      {isCorrect && <span className="ml-auto text-xs font-medium">Benar</span>}
                      {isChosen && !isCorrect && <span className="ml-auto text-xs font-medium">Jawabanmu</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      <Link href="/student" className="text-sm text-blue-600 hover:underline">← Kembali ke dashboard</Link>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ResultsPageInner />
    </Suspense>
  )
}
```

(If the existing results page already has additional markup you want to preserve, keep its visual structure but swap the data source to the single `/api/student/submissions/[submissionId]` fetch and the assignmentId param as shown. The key behavioral change is: NO `/api/assessments/[id]` call, items+correctAnswer+title come from the submission detail.)

- [ ] **Step 2: remove the stale assessment list from the student dashboard**

The Phase 2 dashboard (server component) lists workspace-wide published assessments with links to `/student/assessments/${a.id}` — those ids are assessmentIds, but the take page now expects assignmentIds, so the links are broken. Remove the **Asesmen Tersedia** section entirely (the class-based active-task list arrives in Slice 11). Keep the **Bahan Ajar** section.

In `apps/web/src/app/(student)/student/page.tsx`: delete the `publishedAssessments` query and its `<section>`, and drop the now-unused imports (`assessments`, `inArray` if unused elsewhere). Leave the materials query + section intact.

- [ ] **Step 3: Typecheck + build (route validation — Phase 1 lesson)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK. Confirm `/api/classes/[id]/assignments`, `/api/classes/[id]/assignments/[assignmentId]`, `/api/student/assignments/[id]` present at correct paths; `/student/assessments/[id]` + results still present.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx" "apps/web/src/app/(student)/student/page.tsx"
git commit -m "feat(web): results page from submission detail; remove stale workspace assessment list"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/validators test` passes (+3 new).
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds; new routes at correct paths.
- [ ] `db:push` applied the submissions migration (or flagged pending).
- [ ] Manual (real env): assign a published assessment to a class with a window → enrolled student takes within window → score recorded; before openAt / after dueAt → 403; non-enrolled → 404; double submit → 409; results show pembahasan.

## Self-review notes
- Spec coverage (Slice 10): submissions migration ✓ (T1), CreateAssignment ✓ (T2), assignment routes ✓ (T3), submit rework ✓ (T4), take payload ✓ (T5), results pembahasan ✓ (T6), teacher assign UI ✓ (T7), take page re-key ✓ (T8), results re-key + dashboard cleanup ✓ (T9).
- Security: submit enforces enrollment + window + published + double-submit, all server-side; take payload omits correctAnswer; assignment create validates in-workspace published assessment; soft-delete checks on assignment/class/assessment.
- Type consistency: submit body `{ assignmentId, answers }` matches take page; `/api/student/assignments/[id]` returns `{assignment, assessment, items}`; submission detail returns `{submission, assessmentTitle, items}` matching the results page.
- Note: the student take/results runtime flow is only reachable via direct URL until Slice 11 adds the student class portal that links to assignmentIds. Build stays green; this is the planned mid-transition state.
