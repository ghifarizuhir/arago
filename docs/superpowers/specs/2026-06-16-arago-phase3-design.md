# Arago Phase 3 — Kelas (Classes) — Design

**Date:** 2026-06-16
**Status:** Approved
**Parent spec:** `2026-06-16-arago-platform-design.md` §5, §10 Fase 3
**Builds on:** Phase 1 MVP (PRs #1–#5) + Phase 2 AI Chat (PRs #6–#8), merged to `master`

---

## Scope

Phase 3 = **Kelas**: teachers group students into classes, grant material access per class, assign assessments with open/due windows, and view per-student results. Student content access **narrows from workspace-wide (Phase 2) to class enrollment**.

Out of scope (Phase 4): shortcut jump-ahead, notifications, export PDF, analytics, progress tracking beyond results table.

---

## Key decisions (approved)

1. **Submissions migrate to `assignmentId`-only.** `submissions.assessmentId` is dropped; `submissions.assignmentId` references `classAssignments`. Every take goes through a class assignment. Dev DB has no real data → destructive `db:push`, no data migration.
2. **Class-scoped access** replaces Phase 2 workspace-wide student access. Students read materials via `classMaterials` and take assessments via `classAssignments`, only for classes they're enrolled in.
3. **Teacher enrolls workspace members** (existing `student`-role members) — no per-class invite link.
4. **Material-level** class access (`classMaterials(classId, materialId)`), not module-level.

---

## Data model

### New tables

```
classes
  id          uuid pk
  workspaceId uuid not null → workspaces.id
  teacherId   uuid not null → users.id
  name        varchar(255) not null
  createdAt   timestamptz not null default now
  deletedAt   timestamptz

classEnrollments  (composite pk: classId, studentId)
  classId    uuid not null → classes.id
  studentId  uuid not null → users.id
  enrolledAt timestamptz not null default now

classMaterials  (composite pk: classId, materialId)
  classId    uuid not null → classes.id
  materialId uuid not null → teachingMaterials.id

classAssignments
  id           uuid pk
  classId      uuid not null → classes.id
  assessmentId uuid not null → assessments.id
  openAt       timestamptz not null
  dueAt        timestamptz not null
  createdAt    timestamptz not null default now
  deletedAt    timestamptz
```

### Migration: `submissions`

```
- assessmentId uuid → assessments.id        (REMOVE)
+ assignmentId uuid not null → classAssignments.id
  studentId, answers, score, totalItems, submittedAt, gradedAt   (unchanged)
```
Uniqueness/double-submit guard becomes `(assignmentId, studentId)`.

### Invariants
- UUID PKs; soft delete (`deletedAt`) on `classes` and `classAssignments` (join/enrollment tables are hard rows, like `workspaceMembers`/`assessmentBlueprints`).
- All by-id queries workspace-scope (class → workspaceId). Student routes scope by **`classEnrollments`** membership.
- A class's `teacherId`, enrolled students, and assigned materials/assessments must all belong to the **same workspace** as the class (validate at write time — cross-workspace IDOR guard).

---

> **Slice ordering & build coherence.** The `submissions` migration, the submit rework, and the take-page update are one coupled change — they land together in **Slice 10** so no intermediate slice ships broken student links. Slice 9 adds only the 4 new tables (submissions untouched), keeping the Phase 1/2 student take flow working. Slice 10 performs the migration and, in the same slice, removes the now-stale workspace-wide assessment list from the student dashboard (the class-based task list arrives in Slice 11). Each slice must leave a green `next build` + passing tests; the student *runtime* flow is mid-transition across 10→11, which is acceptable (dev DB, no real users).

## Slice 9 — Classes foundation (teacher-facing)

**Goal:** Teachers create classes, enroll workspace students, assign materials. The 4 new tables land here. No `submissions` change and no student-facing change yet (Phase 2 student views keep working against `workspaceMembers` until Slice 11).

### Schema & validators
- Add the 4 tables in `packages/db/src/schema/index.ts` (+ relations). **`submissions` is NOT changed in this slice** (migrated in Slice 10).
- `@arago/validators`: `CreateClassSchema` (name), `EnrollStudentsSchema` (studentIds: uuid[]), `AssignMaterialsSchema` (materialIds: uuid[]).
- `db:push` against dev DB.

### Routes (all workspace-scoped, teacher session)
```
GET  /api/classes                  list classes in active workspace
POST /api/classes                  create (name) → workspaceId from cookie, teacherId from session
GET  /api/classes/[id]             detail (class + enrolled students + assigned materials)
PATCH/DELETE /api/classes/[id]     rename / soft-delete
POST /api/classes/[id]/enrollments      body { studentIds } — validate each is a student-role member of THIS workspace
DELETE /api/classes/[id]/enrollments/[studentId]   unenroll
POST /api/classes/[id]/materials        body { materialIds } — validate each material belongs (via module) to THIS workspace
DELETE /api/classes/[id]/materials/[materialId]    unassign
```
🔒 **Security:** every route resolves the class by `id` **and** `workspaceId` (active cookie) + `isNull(deletedAt)`. Enrollment validates each `studentId` is a `workspaceMembers` row with `role='student'` in this workspace. Material assignment validates each `materialId` → module → `workspaceId` matches. Reject cross-workspace ids (404/422).

### UI (teacher)
- `/classes` — list + "Buat Kelas".
- `/classes/new` — name form.
- `/classes/[id]` — class detail: rename, enrolled-students panel (add from workspace members, remove), assigned-materials panel (add from workspace published materials, remove).
- Sidebar: add **Kelas** nav item (`/classes`).

### Tests
- Validators: class/enroll/assign schemas.
- Route tests (mirror Phase 1 style): cross-workspace class id → 404; enrolling a non-member or non-student → rejected; assigning a cross-workspace material → rejected.

---

## Slice 10 — Assignments + take-by-assignment (the migration slice)

**Goal:** Teachers assign an assessment to a class with open/due; `submissions` migrates to `assignmentId`; the take/submit flow moves to `assignmentId` with window + enrollment enforcement.

### Schema migration (here, not Slice 9)
- Migrate `submissions`: drop `assessmentId` → add `assignmentId` (not null → `classAssignments.id`). Double-submit guard becomes `(assignmentId, studentId)`. Destructive `db:push` (dev, no data).
- Update `submissions` relations (assessment → assignment).

### Routes
```
POST /api/classes/[id]/assignments     body { assessmentId, openAt, dueAt } — assessment must be in workspace + published; dueAt > openAt
DELETE /api/classes/[id]/assignments/[assignmentId]   soft-delete
```
Rework submit:
```
POST /api/student/submissions          body { assignmentId, answers }   (was { assessmentId, answers })
```
🔒 **Security (submit):** student must be enrolled (`classEnrollments`) in the assignment's class; `now ∈ [openAt, dueAt]` (else 403 with reason); assignment + parent class not soft-deleted; assessment published. Double-submit guard `(assignmentId, studentId)` → 409. Grade server-side via existing `gradeSubmission` over the assessment's items (resolved through the assignment → assessmentId). Never trust client score.

### UI
- **Teacher:** `/classes/[id]` gains an **Asesmen** section: pick a published assessment + openAt/dueAt (datetime inputs) → create assignment; list assignments with window; remove.
- **Student (transition):** the take page `/student/assessments/[id]` is re-keyed to an **assignmentId** — it fetches the assignment (→ assessment + items) and submits `{ assignmentId, answers }`; the results page stays keyed by `submissionId`. **Remove the now-stale workspace-wide assessment list from the `/student` dashboard** (its links targeted assessmentId-based takes); leave the materials section. The class-based active-task list arrives in Slice 11.

### Tests
- Assignment route: cross-workspace assessment → rejected; `dueAt <= openAt` → 422.
- Submit: non-enrolled student → 403/404; before openAt / after dueAt → 403; double submit → 409; correct server-side score.

---

## Slice 11 — Student class portal + results dashboard

**Goal:** Flip student access to class-scoped; teacher sees results.

### Student access narrowing (the breaking change)
- `/student` dashboard → lists **enrolled classes** + **active assignments** (open now, not yet submitted, before due). Replaces the Phase 2 workspace-wide list.
- New `/student/classes/[id]` — class view: assigned materials (links to read page) + assignments (links to take page, with status: belum dibuka / aktif / lewat / sudah dikumpulkan).
- **Narrow material read + tutor:** `/api/student/materials/[id]` and `/api/ai/tutor` change scoping from `workspaceMembers` → student enrolled in a class whose `classMaterials` includes the material. (`teachingMaterials` published + not soft-deleted, parent module not soft-deleted — keep.)
- Take page resolves the assignment (`/student/assessments/...` keyed by `assignmentId`); results page shows score + pembahasan as today, keyed by submission.

### Teacher results dashboard
- `/classes/[id]/results` — per assignment, table of enrolled students × score (submitted/not submitted). 
- Route: `GET /api/classes/[id]/results` — workspace-scoped class; returns enrolled students joined with their submissions per assignment.

### Tests
- Student dashboard query: only enrolled classes / active assignments.
- Read/tutor: a student NOT enrolled in any class containing the material → 404 (verify the Phase 2 workspace-wide path is gone).
- Results: workspace-scoped; non-teacher / cross-workspace → rejected; correct student×score matrix.

---

## Cross-cutting

- **Security invariants (carried + extended):** every by-id query workspace-scopes; teacher write-routes validate that referenced students/materials/assessments are in the same workspace; student routes scope by `classEnrollments` (not `workspaceMembers`, not the teacher cookie); never trust client score/ids; exclude soft-deleted (class, assignment, material, parent module); enforce assignment open/due window server-side.
- **Build gate:** `next build` (route-table validation) before any slice with new routes is "done" — Phase 1 lesson. Watch for escaped route-group/dynamic-segment paths.
- **Per-slice review:** implement (haiku) → spec review → code review → **security review** (sonnet), one PR per slice.
- **Error handling (spec §11):** actionable errors; window/enrollment failures return clear Indonesian messages.

## Routes added (summary)
```
Slice 9:  /classes, /classes/new, /classes/[id]
          /api/classes, /api/classes/[id]
          /api/classes/[id]/enrollments, .../enrollments/[studentId]
          /api/classes/[id]/materials, .../materials/[materialId]
Slice 10: /api/classes/[id]/assignments, .../assignments/[assignmentId]
          /api/student/submissions  (reworked to assignmentId)
Slice 11: /student/classes/[id], /classes/[id]/results
          /api/classes/[id]/results
          (/api/student/materials/[id], /api/ai/tutor — rescoped)
```

## Packages touched
```
@arago/db          4 new tables + submissions migration + relations
@arago/validators  CreateClass, EnrollStudents, AssignMaterials, CreateAssignment schemas
apps/web           teacher classes UI + routes (9), assignment + submit rework (10),
                   student portal + results + access narrowing (11)
```
