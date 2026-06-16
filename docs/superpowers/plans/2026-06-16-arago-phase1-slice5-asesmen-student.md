# Arago Phase 1 — Slice 5: Asesmen & Student Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher combines kisi-kisi into an Asesmen, generates PG soal, edits + publishes; a student takes the published assessment and gets an auto-graded score with per-item review.

**Architecture:** Content chain step 4 + student portal. `assessments` link to `blueprints` via `assessment_blueprints`. AI flattens all indicators → generates items. Grading is a pure function in `@arago/ai/grading`. Submissions are one-per-student (409 on resubmit).

**Tech Stack:** Drizzle, `@arago/ai` (`generateAssessment`, `gradeSubmission`), Next.js client pages, Vitest.

**Slice sequence:** Slice 5 of 5 (final). Requires Slices 1–4.

**Reconciliation note:** The new-assessment blueprint picker must list ALL workspace blueprints, but `GET /api/blueprints` requires a `materialId`. This slice adds `GET /api/workspace-blueprints` (workspace-scoped via modules→materials→blueprints) and points the picker at it.

**🔒 SECURITY — workspace-scope every by-id query (applies to ALL teacher routes in this slice):** `assessments` HAS a `workspaceId` column — every by-id GET/PATCH/DELETE on `/api/assessments/[id]` and the item routes MUST confirm the assessment belongs to the caller's active workspace (`getCurrentWorkspaceId()`), returning 404 otherwise. Item routes (`/api/assessments/[id]/items[...]`) must verify the parent assessment is in the active workspace before reading/mutating items. `generate-assessment` likewise. Creator checks stay as an extra guard on mutations but do NOT replace workspace scoping. NOTE: the STUDENT routes are intentionally different — a student reads a published assessment and submits in any workspace they are a MEMBER of (verified via `workspaceMembers`), so student-side scoping is by membership, not by the teacher's active-workspace cookie. Keep that distinction.

---

### Task 1: Auto-grading pure function

**Files:**
- Create: `packages/ai/src/grading.ts`
- Test: `packages/ai/__tests__/grading.test.ts`

- [ ] **Step 1.1: Grading function** — `packages/ai/src/grading.ts`
```typescript
export type AssessmentItemForGrading = {
  id: string
  correctAnswer: string
}

export type AnswerMap = Record<string, string> // itemId -> choiceId

export type GradingResult = {
  score: number       // 0-100
  correctCount: number
  totalItems: number
}

export function gradeSubmission(
  items: AssessmentItemForGrading[],
  answers: AnswerMap,
): GradingResult {
  if (items.length === 0) {
    return { score: 0, correctCount: 0, totalItems: 0 }
  }
  const correctCount = items.filter(
    (item) => answers[item.id] === item.correctAnswer,
  ).length
  const score = Math.round((correctCount / items.length) * 100)
  return { score, correctCount, totalItems: items.length }
}
```
Expected: Pure, deterministic. `score = round(correct/total*100)`.

- [ ] **Step 1.2: Test** — `packages/ai/__tests__/grading.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { gradeSubmission } from '../src/grading'

describe('gradeSubmission', () => {
  const items = [
    { id: 'q1', correctAnswer: 'a' },
    { id: 'q2', correctAnswer: 'b' },
    { id: 'q3', correctAnswer: 'c' },
    { id: 'q4', correctAnswer: 'd' },
  ]

  it('returns 100 when all answers are correct', () => {
    const result = gradeSubmission(items, { q1: 'a', q2: 'b', q3: 'c', q4: 'd' })
    expect(result.score).toBe(100)
    expect(result.correctCount).toBe(4)
    expect(result.totalItems).toBe(4)
  })

  it('returns 0 when all answers are wrong', () => {
    const result = gradeSubmission(items, { q1: 'b', q2: 'c', q3: 'd', q4: 'a' })
    expect(result.score).toBe(0)
    expect(result.correctCount).toBe(0)
  })

  it('returns 50 when half answers are correct', () => {
    const result = gradeSubmission(items, { q1: 'a', q2: 'b', q3: 'x', q4: 'x' })
    expect(result.score).toBe(50)
    expect(result.correctCount).toBe(2)
  })

  it('treats unanswered items as incorrect', () => {
    const result = gradeSubmission(items, { q1: 'a' })
    expect(result.score).toBe(25)
    expect(result.correctCount).toBe(1)
  })

  it('rounds score correctly (1/3 → 33)', () => {
    const threeItems = [
      { id: 'q1', correctAnswer: 'a' },
      { id: 'q2', correctAnswer: 'b' },
      { id: 'q3', correctAnswer: 'c' },
    ]
    const result = gradeSubmission(threeItems, { q1: 'a' })
    expect(result.score).toBe(33)
  })

  it('returns 0 when items array is empty', () => {
    const result = gradeSubmission([], {})
    expect(result.score).toBe(0)
    expect(result.totalItems).toBe(0)
  })
})
```

- [ ] **Step 1.3: Run + commit**
```bash
pnpm --filter @arago/ai test
git add packages/ai/src/grading.ts "packages/ai/__tests__/grading.test.ts"
git commit -m "feat(ai): auto-grading pure function with tests (KAR-11a)"
```
Expected: 6 cases pass.

---

### Task 2: Assessment API (CRUD + items + generate + workspace picker)

**Files:**
- Create: `apps/web/src/app/api/assessments/route.ts`
- Create: `apps/web/src/app/api/assessments/[id]/route.ts`
- Create: `apps/web/src/app/api/assessments/[id]/items/route.ts`
- Create: `apps/web/src/app/api/assessments/[id]/items/[itemId]/route.ts`
- Create: `apps/web/src/app/api/ai/generate-assessment/route.ts`
- Create: `apps/web/src/app/api/workspace-blueprints/route.ts`

- [ ] **Step 2.1: GET/POST /api/assessments** — `apps/web/src/app/api/assessments/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentBlueprints } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(500),
  blueprintIds: z.array(z.string().uuid()).min(1),
})

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const result = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .orderBy(desc(assessments.createdAt))

  return NextResponse.json({ assessments: result })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { title, blueprintIds } = parsed.data

  const [assessment] = await db
    .insert(assessments)
    .values({ workspaceId, creatorId: session.user.id, title, status: 'draft' })
    .returning()

  await db.insert(assessmentBlueprints).values(
    blueprintIds.map((bpId) => ({ assessmentId: assessment.id, blueprintId: bpId })),
  )

  return NextResponse.json({ assessment }, { status: 201 })
}
```
Expected: POST creates assessment + join rows; GET lists workspace assessments.

- [ ] **Step 2.2: GET/PATCH/DELETE /api/assessments/[id]** — `apps/web/src/app/api/assessments/[id]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentItems, assessmentBlueprints } from '@arago/db/schema'
import { eq, isNull, and, asc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const items = await db
    .select()
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, id))
    .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))

  const bpLinks = await db
    .select()
    .from(assessmentBlueprints)
    .where(eq(assessmentBlueprints.assessmentId, id))

  return NextResponse.json({
    assessment,
    items,
    blueprintIds: bpLinks.map((l) => l.blueprintId),
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [updated] = await db
    .update(assessments)
    .set(parsed.data)
    .where(eq(assessments.id, id))
    .returning()

  return NextResponse.json({ assessment: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const [existing] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), isNull(assessments.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db
    .update(assessments)
    .set({ deletedAt: new Date() })
    .where(eq(assessments.id, id))

  return NextResponse.json({ success: true })
}
```
Expected: GET returns assessment + nested `items` + `blueprintIds`. PATCH/DELETE creator-guarded.

- [ ] **Step 2.3: Assessment item routes** — `apps/web/src/app/api/assessments/[id]/items/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessmentItems } from '@arago/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const optionSchema = z.object({ id: z.string(), text: z.string().min(1) })

const createItemSchema = z.object({
  question: z.string().min(1),
  options: z.array(optionSchema).min(2).max(6),
  correctAnswer: z.string().min(1),
  bloomLevel: z.string().optional(),
  indicatorRef: z.string().optional(),
  sortOrder: z.number().int().default(0),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const items = await db
    .select()
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, id))
    .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId } = await params

  const body = await req.json().catch(() => null)
  const parsed = createItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [item] = await db
    .insert(assessmentItems)
    .values({ assessmentId, ...parsed.data })
    .returning()

  return NextResponse.json({ item }, { status: 201 })
}
```

`apps/web/src/app/api/assessments/[id]/items/[itemId]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessmentItems } from '@arago/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const optionSchema = z.object({ id: z.string(), text: z.string().min(1) })

const patchItemSchema = z.object({
  question: z.string().min(1).optional(),
  options: z.array(optionSchema).min(2).max(6).optional(),
  correctAnswer: z.string().min(1).optional(),
  bloomLevel: z.string().optional(),
  indicatorRef: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId, itemId } = await params

  const body = await req.json().catch(() => null)
  const parsed = patchItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(assessmentItems)
    .where(and(eq(assessmentItems.id, itemId), eq(assessmentItems.assessmentId, assessmentId)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const [updated] = await db
    .update(assessmentItems)
    .set(parsed.data)
    .where(eq(assessmentItems.id, itemId))
    .returning()

  return NextResponse.json({ item: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId, itemId } = await params

  const [existing] = await db
    .select()
    .from(assessmentItems)
    .where(and(eq(assessmentItems.id, itemId), eq(assessmentItems.assessmentId, assessmentId)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  await db.delete(assessmentItems).where(eq(assessmentItems.id, itemId))

  return NextResponse.json({ success: true })
}
```
Expected: POST creates a manual item; PATCH updates; DELETE hard-deletes.

- [ ] **Step 2.4: POST /api/ai/generate-assessment** — `apps/web/src/app/api/ai/generate-assessment/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentBlueprints, blueprints, assessmentItems } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { generateAssessment } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({ assessmentId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { assessmentId } = parsed.data

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const bpLinks = await db
    .select()
    .from(assessmentBlueprints)
    .where(eq(assessmentBlueprints.assessmentId, assessmentId))

  if (bpLinks.length === 0) {
    return NextResponse.json({ error: 'Assessment has no blueprints' }, { status: 422 })
  }

  const blueprintRows = await db
    .select()
    .from(blueprints)
    .where(
      and(
        inArray(blueprints.id, bpLinks.map((l) => l.blueprintId)),
        isNull(blueprints.deletedAt),
      ),
    )

  const allIndicators = blueprintRows.flatMap((bp) =>
    Array.isArray(bp.indicators)
      ? (bp.indicators as Array<{ id: string; description: string; bloomLevel: string; competency: string }>)
      : [],
  )

  if (allIndicators.length === 0) {
    return NextResponse.json({ error: 'Blueprints have no indicators' }, { status: 422 })
  }

  const generated = await generateAssessment(assessment.title, allIndicators)

  const insertValues = generated.items.map((item, idx) => ({
    assessmentId,
    question: item.question,
    options: item.options,
    correctAnswer: item.correctAnswer,
    bloomLevel: item.bloomLevel ?? null,
    indicatorRef: item.indicator ?? null,
    sortOrder: idx,
  }))

  const items = await db.insert(assessmentItems).values(insertValues).returning()

  return NextResponse.json({ items }, { status: 201 })
}
```
Expected: Flattens indicators, generates items, bulk-inserts with sort order.

- [ ] **Step 2.5: Workspace blueprint picker** — `apps/web/src/app/api/workspace-blueprints/route.ts`

> Needed because `GET /api/blueprints` requires `materialId`; the new-assessment picker needs all workspace blueprints.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const modules = await db
    .select({ id: teachingModules.id })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))

  const moduleIds = modules.map((m) => m.id)
  if (moduleIds.length === 0) return NextResponse.json({ blueprints: [] })

  const materials = await db
    .select({ id: teachingMaterials.id })
    .from(teachingMaterials)
    .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt)))

  const materialIds = materials.map((m) => m.id)
  if (materialIds.length === 0) return NextResponse.json({ blueprints: [] })

  const rows = await db
    .select({
      id: blueprints.id,
      title: blueprints.title,
      curriculumType: blueprints.curriculumType,
      materialId: blueprints.materialId,
    })
    .from(blueprints)
    .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))
    .orderBy(blueprints.createdAt)

  return NextResponse.json({ blueprints: rows })
}
```
Expected: Returns `{ blueprints }` for every non-deleted blueprint in the active workspace.

- [ ] **Step 2.6: Commit**
```bash
git add apps/web/src/app/api/assessments/ \
        apps/web/src/app/api/ai/generate-assessment/route.ts \
        apps/web/src/app/api/workspace-blueprints/route.ts
git commit -m "feat(web): asesmen CRUD, item routes, AI generate soal, workspace blueprint picker (KAR-11b)"
```

---

### Task 3: Teacher Asesmen UI

**Files:**
- Create: `apps/web/src/app/(app)/assessments/page.tsx`
- Create: `apps/web/src/app/(app)/assessments/new/page.tsx`
- Create: `apps/web/src/app/(app)/assessments/[id]/page.tsx`

- [ ] **Step 3.1: Assessment list page** — `apps/web/src/app/(app)/assessments/page.tsx`
```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { assessments } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function AssessmentsPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const allAssessments = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .orderBy(desc(assessments.createdAt))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Asesmen</h1>
        <Link
          href="/assessments/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Asesmen Baru
        </Link>
      </div>

      {allAssessments.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">
          Belum ada asesmen. Buat asesmen baru untuk memulai.
        </div>
      ) : (
        <ul className="space-y-3">
          {allAssessments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/assessments/${a.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{a.title}</span>
                <span
                  className={[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    a.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
                  ].join(' ')}
                >
                  {a.status === 'published' ? 'Diterbitkan' : 'Draft'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```
Expected: Lists workspace assessments with status badge.

- [ ] **Step 3.2: New assessment form** — `apps/web/src/app/(app)/assessments/new/page.tsx`

> Fetches blueprints from `/api/workspace-blueprints` (not `/api/blueprints`, which requires a materialId).

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Blueprint = {
  id: string
  title: string
  curriculumType: string
  materialId: string
}

export default function NewAssessmentPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [bpLoading, setBpLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/workspace-blueprints')
      .then((r) => r.json())
      .then(({ blueprints: bps }: { blueprints: Blueprint[] }) => setBlueprints(bps ?? []))
      .catch(() => setBlueprints([]))
      .finally(() => setBpLoading(false))
  }, [])

  const toggleBlueprint = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Judul tidak boleh kosong.')
      return
    }
    if (selectedIds.size === 0) {
      setError('Pilih minimal satu kisi-kisi.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), blueprintIds: [...selectedIds] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal membuat asesmen.')
        return
      }
      const { assessment } = await res.json()
      router.push(`/assessments/${assessment.id}`)
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Asesmen Baru</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">Judul Asesmen</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="cth. Ulangan Harian Bab 1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Kisi-kisi ({selectedIds.size} dipilih)
          </label>
          {bpLoading ? (
            <div className="text-sm text-neutral-400">Memuat kisi-kisi...</div>
          ) : blueprints.length === 0 ? (
            <div className="text-sm text-neutral-400">Belum ada kisi-kisi. Buat kisi-kisi terlebih dahulu.</div>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto border border-neutral-200 rounded-lg p-2">
              {blueprints.map((bp) => (
                <li key={bp.id}>
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(bp.id)}
                      onChange={() => toggleBlueprint(bp.id)}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-sm text-neutral-800">{bp.title}</span>
                    <span className="ml-auto text-xs text-neutral-400">{bp.curriculumType}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Membuat...' : 'Buat Asesmen'}
        </button>
      </form>
    </div>
  )
}
```
Expected: Multi-checkbox picker from workspace blueprints; POSTs then redirects to detail.

- [ ] **Step 3.3: Assessment detail page** — `apps/web/src/app/(app)/assessments/[id]/page.tsx`
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Option = { id: string; text: string }

type AssessmentItem = {
  id: string
  question: string
  options: Option[]
  correctAnswer: string
  bloomLevel: string | null
  indicatorRef: string | null
  sortOrder: number
}

type Assessment = {
  id: string
  title: string
  status: 'draft' | 'published'
  workspaceId: string
}

type EditingItem = {
  question: string
  options: Option[]
  correctAnswer: string
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<AssessmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditingItem | null>(null)
  const [error, setError] = useState('')

  const loadAssessment = () => {
    setLoading(true)
    fetch(`/api/assessments/${id}`)
      .then((r) => r.json())
      .then(({ assessment: a, items: its }: { assessment: Assessment; items: AssessmentItem[] }) => {
        setAssessment(a)
        setItems(its ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAssessment()
  }, [id])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal generate soal.')
        return
      }
      const { items: newItems }: { items: AssessmentItem[] } = await res.json()
      setItems((prev) => [...prev, ...newItems])
    } catch {
      setError('Terjadi kesalahan saat generate soal.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish = async () => {
    if (!assessment) return
    setPublishing(true)
    const next = assessment.status === 'draft' ? 'published' : 'draft'
    try {
      const res = await fetch(`/api/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        const { assessment: updated } = await res.json()
        setAssessment(updated)
      }
    } finally {
      setPublishing(false)
    }
  }

  const startEdit = (item: AssessmentItem) => {
    setEditingId(item.id)
    setEditState({
      question: item.question,
      options: item.options.map((o) => ({ ...o })),
      correctAnswer: item.correctAnswer,
    })
  }

  const saveEdit = async (itemId: string) => {
    if (!editState) return
    const res = await fetch(`/api/assessments/${id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editState),
    })
    if (res.ok) {
      const { item: updated }: { item: AssessmentItem } = await res.json()
      setItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)))
    }
    setEditingId(null)
    setEditState(null)
  }

  const deleteItem = async (itemId: string) => {
    const res = await fetch(`/api/assessments/${id}/items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((it) => it.id !== itemId))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat asesmen...</div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-sm">Asesmen tidak ditemukan.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{assessment.title}</h1>
          <span
            className={[
              'mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              assessment.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
            ].join(' ')}
          >
            {assessment.status === 'published' ? 'Diterbitkan' : 'Draft'}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || assessment.status === 'published'}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Soal'}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              assessment.status === 'draft'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700',
            ].join(' ')}
          >
            {publishing ? '...' : assessment.status === 'draft' ? 'Terbitkan' : 'Jadikan Draft'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg text-neutral-400 text-sm">
          Belum ada soal. Klik &quot;Generate Soal&quot; untuk membuat soal otomatis.
        </div>
      ) : (
        <ol className="space-y-4">
          {items.map((item, idx) => {
            const isEditing = editingId === item.id
            return (
              <li key={item.id} className="p-4 bg-white border border-neutral-200 rounded-lg">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className="text-xs font-semibold text-neutral-400">Soal {idx + 1}</span>
                  {assessment.status === 'draft' && (
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveEdit(item.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Simpan
                          </button>
                          <button type="button" onClick={() => { setEditingId(null); setEditState(null) }} className="text-xs text-neutral-400 hover:text-neutral-600">
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(item)} className="text-xs text-neutral-500 hover:text-neutral-700">
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteItem(item.id)} className="text-xs text-red-500 hover:text-red-700">
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && editState ? (
                  <div className="space-y-3">
                    <textarea
                      value={editState.question}
                      onChange={(e) => setEditState((s) => (s ? { ...s, question: e.target.value } : s))}
                      rows={3}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                    />
                    <div className="space-y-2">
                      {editState.options.map((opt, oi) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${item.id}`}
                            checked={editState.correctAnswer === opt.id}
                            onChange={() => setEditState((s) => (s ? { ...s, correctAnswer: opt.id } : s))}
                            className="text-blue-600"
                          />
                          <span className="text-xs font-medium text-neutral-500 w-5">{String.fromCharCode(65 + oi)}.</span>
                          <input
                            value={opt.text}
                            onChange={(e) => {
                              const text = e.target.value
                              setEditState((s) =>
                                s ? { ...s, options: s.options.map((o) => (o.id === opt.id ? { ...o, text } : o)) } : s,
                              )
                            }}
                            className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-400">Pilih radio button untuk menandai jawaban benar.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-neutral-800 mb-3">{item.question}</p>
                    <ul className="space-y-1.5">
                      {item.options.map((opt, oi) => (
                        <li
                          key={opt.id}
                          className={[
                            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg',
                            item.correctAnswer === opt.id ? 'bg-green-50 text-green-800 font-medium' : 'text-neutral-700',
                          ].join(' ')}
                        >
                          <span className="font-medium text-neutral-400 text-xs w-5">{String.fromCharCode(65 + oi)}.</span>
                          {opt.text}
                          {item.correctAnswer === opt.id && <span className="ml-auto text-xs text-green-600">✓ Benar</span>}
                        </li>
                      ))}
                    </ul>
                    {item.bloomLevel && <p className="mt-2 text-xs text-neutral-400">Bloom: {item.bloomLevel}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
```
Expected: Generate disabled once published; inline edit per item; correct answer highlighted green.

- [ ] **Step 3.4: Commit**
```bash
git add "apps/web/src/app/(app)/assessments/"
git commit -m "feat(web): teacher asesmen UI — list, create, detail with generate/edit/publish (KAR-11c)"
```

---

### Task 4: Student Portal

**Files:**
- Create: `apps/web/src/app/(student)/layout.tsx`
- Create: `apps/web/src/app/(student)/student/page.tsx`
- Create: `apps/web/src/app/(student)/student/assessments/[id]/page.tsx`
- Create: `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx`
- Create: `apps/web/src/app/api/student/submissions/route.ts`
- Create: `apps/web/src/app/api/student/submissions/[id]/route.ts`

- [ ] **Step 4.1: POST /api/student/submissions** — `apps/web/src/app/api/student/submissions/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentItems, submissions } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { gradeSubmission } from '@arago/ai/grading'
import { z } from 'zod'

const bodySchema = z.object({
  assessmentId: z.string().uuid(),
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

  const { assessmentId, answers } = parsed.data

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  if (assessment.status !== 'published') {
    return NextResponse.json({ error: 'Assessment is not published' }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assessmentId, assessmentId), eq(submissions.studentId, session.user.id)))
    .limit(1)

  if (existing) {
    return NextResponse.json({ error: 'Already submitted', submissionId: existing.id }, { status: 409 })
  }

  const items = await db
    .select({ id: assessmentItems.id, correctAnswer: assessmentItems.correctAnswer })
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, assessmentId))

  const { score, totalItems } = gradeSubmission(items, answers)

  const now = new Date()
  const [submission] = await db
    .insert(submissions)
    .values({
      assessmentId,
      studentId: session.user.id,
      answers,
      score,
      totalItems,
      submittedAt: now,
      gradedAt: now,
    })
    .returning()

  return NextResponse.json({ submissionId: submission.id, score, totalItems }, { status: 201 })
}
```
Expected: 409 on resubmit, 422 if draft, auto-grade inline, returns `{ submissionId, score, totalItems }`.

- [ ] **Step 4.2: GET /api/student/submissions/[id]** — `apps/web/src/app/api/student/submissions/[id]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { submissions } from '@arago/db/schema'
import { eq, and } from 'drizzle-orm'
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

  return NextResponse.json({ submission })
}
```
Expected: Returns the submission only if owned by the authenticated user.

- [ ] **Step 4.3: Student layout** — `apps/web/src/app/(student)/layout.tsx`
```tsx
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-neutral-900">Arago Student</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{session.user.name ?? session.user.email}</span>
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
```
Expected: Minimal layout — no sidebar.

- [ ] **Step 4.4: Student dashboard** — `apps/web/src/app/(student)/student/page.tsx`
```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { assessments, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentDashboardPage() {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  const memberships = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, session.user.id))

  const workspaceIds = memberships.map((m) => m.workspaceId)

  const publishedAssessments =
    workspaceIds.length === 0
      ? []
      : await db
          .select()
          .from(assessments)
          .where(
            and(
              inArray(assessments.workspaceId, workspaceIds),
              eq(assessments.status, 'published'),
              isNull(assessments.deletedAt),
            ),
          )
          .orderBy(assessments.createdAt)

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Asesmen Tersedia</h1>

      {publishedAssessments.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">Belum ada asesmen yang tersedia.</div>
      ) : (
        <ul className="space-y-3">
          {publishedAssessments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/student/assessments/${a.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{a.title}</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Diterbitkan
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```
Expected: Only published assessments from workspaces the student belongs to.

- [ ] **Step 4.5: Take-assessment page** — `apps/web/src/app/(student)/student/assessments/[id]/page.tsx`
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; sortOrder: number }
type Assessment = { id: string; title: string; status: string }

export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<AssessmentItem[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/assessments/${id}`)
      .then((r) => r.json())
      .then(({ assessment: a, items: its }: { assessment: Assessment; items: AssessmentItem[] }) => {
        setAssessment(a)
        setItems(its ?? [])
      })
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
        body: JSON.stringify({ assessmentId: id, answers }),
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
Expected: Radio selection per item; warns on unanswered; redirects to results (or to results if already submitted).

- [ ] **Step 4.6: Results page** — `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx`
```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; correctAnswer: string; sortOrder: number }
type Submission = { id: string; score: number; totalItems: number; answers: Record<string, string>; submittedAt: string }

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
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

    Promise.all([
      fetch(`/api/assessments/${id}`).then((r) => r.json()),
      fetch(`/api/student/submissions/${submissionId}`).then((r) => r.json()),
    ])
      .then(
        ([
          { assessment, items: its },
          { submission: sub },
        ]: [
          { assessment: { title: string }; items: AssessmentItem[] },
          { submission: Submission },
        ]) => {
          setAssessmentTitle(assessment?.title ?? '')
          setItems(its ?? [])
          setSubmission(sub)
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

  const correctCount = items.filter((item) => submission.answers[item.id] === item.correctAnswer).length

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">{assessmentTitle}</h1>
        <p className="text-neutral-500 text-sm mb-4">Hasil Asesmen</p>
        <div
          className={[
            'inline-flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 mb-2',
            submission.score >= 75 ? 'border-green-400 bg-green-50' : submission.score >= 50 ? 'border-yellow-400 bg-yellow-50' : 'border-red-400 bg-red-50',
          ].join(' ')}
        >
          <span
            className={[
              'text-4xl font-bold',
              submission.score >= 75 ? 'text-green-700' : submission.score >= 50 ? 'text-yellow-700' : 'text-red-700',
            ].join(' ')}
          >
            {submission.score}
          </span>
          <span className="text-xs text-neutral-500">/ 100</span>
        </div>
        <p className="text-sm text-neutral-600">{correctCount} dari {submission.totalItems} jawaban benar</p>
      </div>

      <ol className="space-y-4 mb-8">
        {items.map((item, idx) => {
          const studentAnswer = submission.answers[item.id]
          const isCorrect = studentAnswer === item.correctAnswer
          return (
            <li
              key={item.id}
              className={['p-4 border rounded-lg', isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'].join(' ')}
            >
              <div className="flex items-start gap-2 mb-3">
                <span
                  className={[
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 mt-0.5',
                    isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
                  ].join(' ')}
                >
                  {isCorrect ? '✓' : '✗'}
                </span>
                <p className="text-sm font-medium text-neutral-800">{idx + 1}. {item.question}</p>
              </div>
              <ul className="space-y-1 ml-7">
                {item.options.map((opt, oi) => {
                  const isCorrectOpt = opt.id === item.correctAnswer
                  const isStudentChoice = opt.id === studentAnswer
                  return (
                    <li
                      key={opt.id}
                      className={[
                        'flex items-center gap-2 text-sm px-2 py-1 rounded',
                        isCorrectOpt
                          ? 'bg-green-200 text-green-900 font-medium'
                          : isStudentChoice && !isCorrectOpt
                          ? 'bg-red-200 text-red-900 line-through'
                          : 'text-neutral-600',
                      ].join(' ')}
                    >
                      <span className="text-xs text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                      {opt.text}
                      {isCorrectOpt && <span className="ml-auto text-xs text-green-700">Jawaban benar</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      <Link
        href="/student"
        className="block text-center py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  )
}
```
Expected: Circular score badge (green ≥75, yellow ≥50, red <50); per-item correct/wrong with student's wrong answer struck through.

- [ ] **Step 4.7: Commit**
```bash
git add "apps/web/src/app/(student)/" \
        apps/web/src/app/api/student/
git commit -m "feat(web): student portal — dashboard, take assessment, auto-graded results (KAR-11d)"
```

---

## Slice 5 Done — Definition of Done

- `pnpm --filter @arago/ai test` (grading) + `pnpm --filter @arago/web test` green
- Manual end-to-end: teacher creates assessment from kisi-kisi → generate soal → edit → publish → student account (joined via invite) sees it → takes it → gets auto-graded score + per-item review → resubmit returns the same result (409 → results)

---

## Phase 1 Complete

All five slices shipped end-to-end: **register → workspace → upload modul → AI bahan ajar → AI kisi-kisi → asesmen + publish → student takes + auto-nilai.**

**Next phases** (separate specs/plans): Phase 2 — AI Chat sidebar + RAG tutor + curriculum templates; Phase 3 — Kelas management; Phase 4 — Polish.
