# Phase 3 Slice 9 — Classes Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers create classes, enroll workspace student-members, and assign published materials to a class. Lands the 4 new class tables (submissions untouched).

**Architecture:** Add `classes`, `classEnrollments`, `classMaterials`, `classAssignments` to the Drizzle schema (+ relations). Add Zod schemas to `@arago/validators`. Build workspace-scoped teacher API routes following the existing `assessments` route pattern (`requireAuth` + `getCurrentWorkspaceId`, by-id queries scoped by `workspaceId` + `isNull(deletedAt)`, cross-workspace reference validation via innerJoin). Build teacher UI pages mirroring the existing list/detail server-component pattern.

**Tech Stack:** Drizzle ORM (postgres), Zod, Next 15 App Router (server components + route handlers), Vitest.

**Security invariants (carried from Phase 1/2):** every by-id query workspace-scopes; teacher write-routes validate referenced students/materials are in the SAME workspace; never trust client ids; exclude soft-deleted. `classAssignments` table is created here but unused until Slice 10.

---

## File Structure

- Modify `packages/db/src/schema/index.ts` — 4 new tables + relations.
- Modify `packages/validators/src/index.ts` — `CreateClassSchema`, `EnrollStudentsSchema`, `AssignMaterialsSchema`.
- Modify `packages/validators/src/index.test.ts` — schema tests.
- Create `apps/web/src/app/api/classes/route.ts` — GET list, POST create.
- Create `apps/web/src/app/api/classes/[id]/route.ts` — GET detail, PATCH rename, DELETE soft-delete.
- Create `apps/web/src/app/api/classes/[id]/enrollments/route.ts` — POST enroll.
- Create `apps/web/src/app/api/classes/[id]/enrollments/[studentId]/route.ts` — DELETE unenroll.
- Create `apps/web/src/app/api/classes/[id]/materials/route.ts` — POST assign.
- Create `apps/web/src/app/api/classes/[id]/materials/[materialId]/route.ts` — DELETE unassign.
- Create `apps/web/src/app/api/workspace-members/route.ts` — GET list workspace student-members (for the enrollment picker).
- Create `apps/web/src/app/api/workspace-materials/route.ts` — GET list workspace published materials (for the material-assignment picker).
- Create `apps/web/src/app/(app)/classes/page.tsx` — list.
- Create `apps/web/src/app/(app)/classes/new/page.tsx` — create form.
- Create `apps/web/src/app/(app)/classes/[id]/page.tsx` — detail (rename + enrollment + materials panels).
- Modify `apps/web/src/components/sidebar.tsx` — add Kelas nav item.

---

## Task 1: Schema — 4 class tables + relations

**Files:**
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Add the tables**

In `packages/db/src/schema/index.ts`, after the `submissions` table block (before the `// ─── Relations` section), add:

```ts
// ─── Classes (Kelas) ────────────────────────────────────────────────────────

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const classEnrollments = pgTable(
  "class_enrollments",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentId] })]
);

export const classMaterials = pgTable(
  "class_materials",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => teachingMaterials.id)
  },
  (t) => [primaryKey({ columns: [t.classId, t.materialId] })]
);

export const classAssignments = pgTable("class_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id),
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id),
  openAt: timestamp("open_at", { withTimezone: true }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});
```

- [ ] **Step 2: Add relations**

At the end of the file (after `submissionsRelations`), add:

```ts
export const classesRelations = relations(classes, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [classes.workspaceId],
    references: [workspaces.id]
  }),
  teacher: one(users, { fields: [classes.teacherId], references: [users.id] }),
  enrollments: many(classEnrollments),
  materials: many(classMaterials),
  assignments: many(classAssignments)
}));

export const classEnrollmentsRelations = relations(
  classEnrollments,
  ({ one }) => ({
    class: one(classes, {
      fields: [classEnrollments.classId],
      references: [classes.id]
    }),
    student: one(users, {
      fields: [classEnrollments.studentId],
      references: [users.id]
    })
  })
);

export const classMaterialsRelations = relations(classMaterials, ({ one }) => ({
  class: one(classes, {
    fields: [classMaterials.classId],
    references: [classes.id]
  }),
  material: one(teachingMaterials, {
    fields: [classMaterials.materialId],
    references: [teachingMaterials.id]
  })
}));

export const classAssignmentsRelations = relations(
  classAssignments,
  ({ one, many }) => ({
    class: one(classes, {
      fields: [classAssignments.classId],
      references: [classes.id]
    }),
    assessment: one(assessments, {
      fields: [classAssignments.assessmentId],
      references: [assessments.id]
    }),
    submissions: many(submissions)
  })
);
```

- [ ] **Step 3: Typecheck the db package**

Run: `pnpm --filter @arago/db typecheck`
Expected: PASS (no type errors). `submissions` is NOT touched in this slice.

- [ ] **Step 4: Push schema to the dev DB** (requires a real `DATABASE_URL`)

Run: `pnpm --filter @arago/db db:push`
Expected: drizzle-kit creates `classes`, `class_enrollments`, `class_materials`, `class_assignments`. (If no dev DB is reachable, note it — the implementer may skip the live push and rely on typecheck; flag as DONE_WITH_CONCERNS so the controller knows the push is pending.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/index.ts
git commit -m "feat(db): add classes, classEnrollments, classMaterials, classAssignments tables"
```

---

## Task 2: Validators

**Files:**
- Modify: `packages/validators/src/index.ts`
- Test: `packages/validators/src/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/validators/src/index.test.ts` (follow the existing describe-block style in that file):

```ts
import {
  CreateClassSchema,
  EnrollStudentsSchema,
  AssignMaterialsSchema,
} from "./index";

describe("CreateClassSchema", () => {
  it("accepts a valid name", () => {
    expect(CreateClassSchema.safeParse({ name: "Kelas 7A" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(CreateClassSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("EnrollStudentsSchema", () => {
  it("accepts an array of uuids", () => {
    expect(
      EnrollStudentsSchema.safeParse({
        studentIds: ["11111111-1111-1111-1111-111111111111"],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty array", () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: [] }).success).toBe(false);
  });
  it("rejects non-uuid entries", () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: ["nope"] }).success).toBe(false);
  });
});

describe("AssignMaterialsSchema", () => {
  it("accepts an array of uuids", () => {
    expect(
      AssignMaterialsSchema.safeParse({
        materialIds: ["22222222-2222-2222-2222-222222222222"],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty array", () => {
    expect(AssignMaterialsSchema.safeParse({ materialIds: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @arago/validators test -- -t "CreateClassSchema"`
Expected: FAIL — schemas not exported.

- [ ] **Step 3: Add the schemas**

In `packages/validators/src/index.ts`, after the blueprint/assessment schemas (near the other `Create*Schema` exports), add:

```ts
// ─── Class (Kelas) schemas ────────────────────────────────────────────────────

export const CreateClassSchema = z.object({
  name: z
    .string()
    .min(1, "Class name is required")
    .max(255, "Class name must be 255 characters or fewer")
});
export type CreateClassInput = z.infer<typeof CreateClassSchema>;

export const EnrollStudentsSchema = z.object({
  studentIds: z.array(uuidSchema).min(1, "Select at least one student")
});
export type EnrollStudentsInput = z.infer<typeof EnrollStudentsSchema>;

export const AssignMaterialsSchema = z.object({
  materialIds: z.array(uuidSchema).min(1, "Select at least one material")
});
export type AssignMaterialsInput = z.infer<typeof AssignMaterialsSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @arago/validators test`
Expected: PASS (existing 27 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/index.ts packages/validators/src/index.test.ts
git commit -m "feat(validators): CreateClass, EnrollStudents, AssignMaterials schemas"
```

---

## Task 3: `GET/POST /api/classes`

**Files:**
- Create: `apps/web/src/app/api/classes/route.ts`

- [ ] **Step 1: Write the route**

Mirror `apps/web/src/app/api/assessments/route.ts`. Create `apps/web/src/app/api/classes/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { CreateClassSchema } from '@arago/validators'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const result = await db
    .select()
    .from(classes)
    .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .orderBy(desc(classes.createdAt))

  return NextResponse.json({ classes: result })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [created] = await db
    .insert(classes)
    .values({ workspaceId, teacherId: session.user.id, name: parsed.data.name })
    .returning()

  if (!created) {
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
  }

  return NextResponse.json({ class: created }, { status: 201 })
}
```

- [ ] **Step 2: Typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/classes/route.ts
git commit -m "feat(web): GET/POST /api/classes (workspace-scoped)"
```

---

## Task 4: `GET/PATCH/DELETE /api/classes/[id]`

**Files:**
- Create: `apps/web/src/app/api/classes/[id]/route.ts`

- [ ] **Step 1: Write the route**

Detail returns the class + enrolled students (joined to users for name/email) + assigned materials (joined for title). Mirror the scoping of `assessments/[id]`. Create `apps/web/src/app/api/classes/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classEnrollments, classMaterials, teachingMaterials, users } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

type Params = { params: Promise<{ id: string }> }

async function loadScopedClass(id: string, workspaceId: string) {
  const [cls] = await db
    .select()
    .from(classes)
    .where(
      and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)),
    )
    .limit(1)
  return cls
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const enrolled = await db
    .select({ studentId: classEnrollments.studentId, name: users.name, email: users.email })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .where(eq(classEnrollments.classId, id))

  const materials = await db
    .select({ materialId: classMaterials.materialId, title: teachingMaterials.title })
    .from(classMaterials)
    .innerJoin(teachingMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .where(eq(classMaterials.classId, id))

  return NextResponse.json({ class: cls, enrolled, materials })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const [updated] = await db
    .update(classes)
    .set({ name: parsed.data.name })
    .where(eq(classes.id, id))
    .returning()

  return NextResponse.json({ class: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  await db.update(classes).set({ deletedAt: new Date() }).where(eq(classes.id, id))

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/api/classes/[id]/route.ts"
git commit -m "feat(web): GET/PATCH/DELETE /api/classes/[id] (workspace-scoped, uuid-guarded)"
```

---

## Task 5: Enrollment routes + workspace-members list

**Files:**
- Create: `apps/web/src/app/api/workspace-members/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/enrollments/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/enrollments/[studentId]/route.ts`

- [ ] **Step 1: workspace-members list route (student-role members for the picker)**

Create `apps/web/src/app/api/workspace-members/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { workspaceMembers, users } from '@arago/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const members = await db
    .select({ userId: workspaceMembers.userId, name: users.name, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'student')))

  return NextResponse.json({ members })
}
```

- [ ] **Step 2: enroll route (POST)**

Create `apps/web/src/app/api/classes/[id]/enrollments/route.ts`. 🔒 Validate the class is in this workspace AND every `studentId` is a `student`-role member of THIS workspace before inserting.

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classEnrollments, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { EnrollStudentsSchema } from '@arago/validators'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

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
  const parsed = EnrollStudentsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // Every studentId must be a student-role member of THIS workspace.
  const validRows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'student'),
        inArray(workspaceMembers.userId, parsed.data.studentIds),
      ),
    )
  const validIds = new Set(validRows.map((r) => r.userId))
  if (parsed.data.studentIds.some((sid) => !validIds.has(sid))) {
    return NextResponse.json(
      { error: 'One or more users are not student members of this workspace' },
      { status: 422 },
    )
  }

  await db
    .insert(classEnrollments)
    .values(parsed.data.studentIds.map((studentId) => ({ classId: id, studentId })))
    .onConflictDoNothing()

  return NextResponse.json({ success: true }, { status: 201 })
}
```

- [ ] **Step 3: unenroll route (DELETE)**

Create `apps/web/src/app/api/classes/[id]/enrollments/[studentId]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classEnrollments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; studentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id, studentId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(studentId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  await db
    .delete(classEnrollments)
    .where(and(eq(classEnrollments.classId, id), eq(classEnrollments.studentId, studentId)))

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/workspace-members/route.ts "apps/web/src/app/api/classes/[id]/enrollments/route.ts" "apps/web/src/app/api/classes/[id]/enrollments/[studentId]/route.ts"
git commit -m "feat(web): class enrollment routes + workspace student-member list (validated in-workspace)"
```

---

## Task 6: Material-assignment routes

**Files:**
- Create: `apps/web/src/app/api/classes/[id]/materials/route.ts`
- Create: `apps/web/src/app/api/classes/[id]/materials/[materialId]/route.ts`

- [ ] **Step 1: assign route (POST)**

🔒 Validate every `materialId` belongs (material → module) to THIS workspace and is published + not soft-deleted. Create `apps/web/src/app/api/classes/[id]/materials/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classMaterials, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { AssignMaterialsSchema } from '@arago/validators'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

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
  const parsed = AssignMaterialsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // Every materialId must be a published, non-deleted material in THIS workspace.
  const validRows = await db
    .select({ id: teachingMaterials.id })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        inArray(teachingMaterials.id, parsed.data.materialIds),
        eq(teachingModules.workspaceId, workspaceId),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
      ),
    )
  const validIds = new Set(validRows.map((r) => r.id))
  if (parsed.data.materialIds.some((mid) => !validIds.has(mid))) {
    return NextResponse.json(
      { error: 'One or more materials are not published materials in this workspace' },
      { status: 422 },
    )
  }

  await db
    .insert(classMaterials)
    .values(parsed.data.materialIds.map((materialId) => ({ classId: id, materialId })))
    .onConflictDoNothing()

  return NextResponse.json({ success: true }, { status: 201 })
}
```

- [ ] **Step 2: unassign route (DELETE)**

Create `apps/web/src/app/api/classes/[id]/materials/[materialId]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; materialId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id, materialId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(materialId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  await db
    .delete(classMaterials)
    .where(and(eq(classMaterials.classId, id), eq(classMaterials.materialId, materialId)))

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: workspace-materials list route (published, for the picker)**

`/api/materials` is module-scoped (requires a `moduleId`), so it can't list workspace-wide materials. Add a workspace-wide published-materials route, mirroring `apps/web/src/app/api/workspace-blueprints/route.ts`. Create `apps/web/src/app/api/workspace-materials/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const rows = await db
    .select({ id: teachingMaterials.id, title: teachingMaterials.title })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingModules.workspaceId, workspaceId),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
      ),
    )
    .orderBy(teachingMaterials.createdAt)

  return NextResponse.json({ materials: rows })
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/classes/[id]/materials/route.ts" "apps/web/src/app/api/classes/[id]/materials/[materialId]/route.ts" apps/web/src/app/api/workspace-materials/route.ts
git commit -m "feat(web): class material-assignment routes + workspace-materials list (in-workspace published only)"
```

---

## Task 7: Teacher UI — list + create

**Files:**
- Create: `apps/web/src/app/(app)/classes/page.tsx`
- Create: `apps/web/src/app/(app)/classes/new/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: list page (server component)**

Mirror `apps/web/src/app/(app)/assessments/page.tsx`. Create `apps/web/src/app/(app)/classes/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { classes } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function ClassesPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const allClasses = await db
    .select()
    .from(classes)
    .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .orderBy(desc(classes.createdAt))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Kelas</h1>
        <Link
          href="/classes/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Kelas Baru
        </Link>
      </div>

      {allClasses.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">
          Belum ada kelas. Buat kelas baru untuk memulai.
        </div>
      ) : (
        <ul className="space-y-3">
          {allClasses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/classes/${c.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: create page (client component)**

Create `apps/web/src/app/(app)/classes/new/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewClassPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        setError('Gagal membuat kelas.')
        return
      }
      const { class: created } = await res.json()
      router.push(`/classes/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Kelas Baru</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Nama Kelas</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Kelas 7A"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Buat Kelas'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: add Kelas to the sidebar**

In `apps/web/src/components/sidebar.tsx`, change the `NAV_ITEMS` array to add Kelas after Asesmen:

```tsx
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/modules', label: 'Modul Ajar' },
  { href: '/blueprints', label: 'Kisi-kisi' },
  { href: '/assessments', label: 'Asesmen' },
  { href: '/classes', label: 'Kelas' },
] as const;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/classes/page.tsx" "apps/web/src/app/(app)/classes/new/page.tsx" apps/web/src/components/sidebar.tsx
git commit -m "feat(web): teacher classes list + create page + Kelas nav"
```

---

## Task 8: Teacher UI — class detail (rename, enrollment, materials)

**Files:**
- Create: `apps/web/src/app/(app)/classes/[id]/page.tsx`

- [ ] **Step 1: write the detail page (client component)**

A client page that loads `/api/classes/[id]` (class + enrolled + materials), the workspace student-members (`/api/workspace-members`) and the workspace published materials (`/api/materials` — the existing teacher materials list; if that endpoint doesn't return published-only, filter client-side by `status === 'published'`). It supports: rename (PATCH), enroll selected students (POST enrollments), unenroll (DELETE), assign selected materials (POST materials), unassign (DELETE).

Create `apps/web/src/app/(app)/classes/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type Enrolled = { studentId: string; name: string; email: string }
type AssignedMaterial = { materialId: string; title: string }
type Member = { userId: string; name: string; email: string }
type Material = { id: string; title: string }
type ClassRow = { id: string; name: string }

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [name, setName] = useState('')
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [materials, setMaterials] = useState<AssignedMaterial[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [wsMaterials, setWsMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${id}`)
    if (!res.ok) {
      setCls(null)
      setLoading(false)
      return
    }
    const data = await res.json()
    setCls(data.class)
    setName(data.class.name)
    setEnrolled(data.enrolled ?? [])
    setMaterials(data.materials ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/workspace-members')
      .then((r) => r.json())
      .then(({ members: m }: { members: Member[] }) => setMembers(m ?? []))
      .catch(() => setMembers([]))
    fetch('/api/workspace-materials')
      .then((r) => r.json())
      .then(({ materials: m }: { materials: Material[] }) => setWsMaterials(m ?? []))
      .catch(() => setWsMaterials([]))
  }, [load])

  async function rename() {
    await fetch(`/api/classes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  async function enroll(studentId: string) {
    await fetch(`/api/classes/${id}/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [studentId] }),
    })
    await load()
  }

  async function unenroll(studentId: string) {
    await fetch(`/api/classes/${id}/enrollments/${studentId}`, { method: 'DELETE' })
    await load()
  }

  async function assignMaterial(materialId: string) {
    await fetch(`/api/classes/${id}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialIds: [materialId] }),
    })
    await load()
  }

  async function unassignMaterial(materialId: string) {
    await fetch(`/api/classes/${id}/materials/${materialId}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat kelas...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  const enrolledIds = new Set(enrolled.map((e) => e.studentId))
  const assignedIds = new Set(materials.map((m) => m.materialId))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <section>
        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Nama Kelas</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            className="flex-1 text-xl font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none pb-1"
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Murid</h2>
        {enrolled.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Belum ada murid terdaftar.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {enrolled.map((e) => (
              <li key={e.studentId} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                <span className="text-sm text-neutral-800">{e.name} <span className="text-neutral-400">{e.email}</span></span>
                <button onClick={() => unenroll(e.studentId)} className="text-xs text-red-600 hover:underline">Keluarkan</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah murid</div>
        <ul className="space-y-1">
          {members.filter((m) => !enrolledIds.has(m.userId)).map((m) => (
            <li key={m.userId} className="flex items-center justify-between p-2 text-sm">
              <span>{m.name} <span className="text-neutral-400">{m.email}</span></span>
              <button onClick={() => enroll(m.userId)} className="text-xs text-blue-600 hover:underline">Tambah</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Bahan Ajar</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {materials.map((m) => (
              <li key={m.materialId} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                <span className="text-sm text-neutral-800">{m.title}</span>
                <button onClick={() => unassignMaterial(m.materialId)} className="text-xs text-red-600 hover:underline">Hapus</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah bahan ajar</div>
        <ul className="space-y-1">
          {wsMaterials.filter((m) => !assignedIds.has(m.id)).map((m) => (
            <li key={m.id} className="flex items-center justify-between p-2 text-sm">
              <span>{m.title}</span>
              <button onClick={() => assignMaterial(m.id)} className="text-xs text-blue-600 hover:underline">Tambah</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

(This page uses `/api/workspace-materials` from Task 6 Step 3, which returns `{ materials: [{id,title}] }` — workspace-wide published materials. `/api/workspace-members` returns `{ members: [{userId,name,email}] }`.)

- [ ] **Step 2: Typecheck + build (route validation — Phase 1 lesson)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK. Confirm these routes appear at CORRECT paths (NOT literal-backslash): `/classes`, `/classes/new`, `/classes/[id]`, `/api/classes`, `/api/classes/[id]`, `/api/classes/[id]/enrollments`, `/api/classes/[id]/enrollments/[studentId]`, `/api/classes/[id]/materials`, `/api/classes/[id]/materials/[materialId]`, `/api/workspace-members`, `/api/workspace-materials`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/classes/[id]/page.tsx"
git commit -m "feat(web): class detail page — rename, enroll/unenroll, assign/unassign materials"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/validators test` passes (27 + 7 new).
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds; all 11 new routes at correct paths.
- [ ] `db:push` applied the 4 tables (or flagged pending if no dev DB).
- [ ] Manual (real env): create a class → enroll a student member → assign a published material → reload shows them; cross-workspace ids rejected.

## Self-review notes
- Spec coverage (Slice 9): 4 tables ✓ (T1), validators ✓ (T2), classes CRUD ✓ (T3/T4), enrollment ✓ (T5), material assignment ✓ (T6), teacher UI ✓ (T7/T8), Kelas nav ✓ (T7).
- Security: every by-id route scopes by `workspaceId` + `isNull(deletedAt)` + uuid-guard; enroll validates student-role membership IN workspace; material-assign validates material in-workspace + published. `submissions` untouched (migrated in Slice 10).
- Uncertainty: the `/api/materials` shape for the detail page's material picker (T8 Step 1 note) — implementer verifies; security-review will confirm scoping regardless.
