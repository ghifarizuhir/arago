# Phase 4 Slice 15 — Workspace Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher-only workspace analytics dashboard — content counts, enrolled students, submission count, and average score per assessment.

**Architecture:** One workspace-scoped, teacher-gated `GET /api/analytics` that runs the aggregate queries (counts via row-length, averages computed in JS for clarity at this scale) and returns a single JSON blob. A client `/analytics` page renders stat cards + a per-assessment average table.

**Tech Stack:** Drizzle, Next 15 route handler + client page, Vitest.

**Security invariants:** `requireWorkspaceTeacher(workspaceId)`; every aggregate scoped to the active workspace (content via the module→workspace chain or `workspaceId` directly; submissions via classAssignments→classes→workspaceId). Read-only. No client-trust.

---

## File Structure

- Create `apps/web/src/app/api/analytics/route.ts` — GET aggregates.
- Create `apps/web/src/app/(app)/analytics/page.tsx` — dashboard.
- Modify `apps/web/src/components/sidebar.tsx` — add Analitik nav.

---

## Task 1: `GET /api/analytics`

**Files:**
- Create: `apps/web/src/app/api/analytics/route.ts`

- [ ] **Step 1: write the route**

🔒 Teacher-gated + workspace-scoped. Create `apps/web/src/app/api/analytics/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import {
  teachingModules,
  teachingMaterials,
  blueprints,
  assessments,
  classes,
  classEnrollments,
  classAssignments,
  submissions,
} from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  // Content counts (workspace-scoped, not soft-deleted)
  const moduleRows = await db
    .select({ id: teachingModules.id })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
  const moduleIds = moduleRows.map((m) => m.id)

  const materialRows =
    moduleIds.length === 0
      ? []
      : await db
          .select({ id: teachingMaterials.id })
          .from(teachingMaterials)
          .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt)))
  const materialIds = materialRows.map((m) => m.id)

  const blueprintRows =
    materialIds.length === 0
      ? []
      : await db
          .select({ id: blueprints.id })
          .from(blueprints)
          .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))

  const assessmentRows = await db
    .select({ id: assessments.id, title: assessments.title })
    .from(assessments)
    .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))

  const classRows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
  const classIds = classRows.map((c) => c.id)

  // Distinct enrolled students across workspace classes
  const enrollRows =
    classIds.length === 0
      ? []
      : await db
          .select({ studentId: classEnrollments.studentId })
          .from(classEnrollments)
          .where(inArray(classEnrollments.classId, classIds))
  const students = new Set(enrollRows.map((e) => e.studentId)).size

  // Submissions for this workspace's assignments (+ score & assessment for averaging)
  const subRows =
    classIds.length === 0
      ? []
      : await db
          .select({
            score: submissions.score,
            assessmentId: classAssignments.assessmentId,
          })
          .from(submissions)
          .innerJoin(classAssignments, eq(submissions.assignmentId, classAssignments.id))
          .where(inArray(classAssignments.classId, classIds))

  // Average score per assessment (JS-side)
  const byAssessment = new Map<string, { sum: number; n: number }>()
  for (const s of subRows) {
    if (s.score === null) continue
    const cur = byAssessment.get(s.assessmentId) ?? { sum: 0, n: 0 }
    cur.sum += s.score
    cur.n += 1
    byAssessment.set(s.assessmentId, cur)
  }
  const titleOf = new Map(assessmentRows.map((a) => [a.id, a.title]))
  const avgByAssessment = [...byAssessment.entries()].map(([assessmentId, { sum, n }]) => ({
    assessmentId,
    title: titleOf.get(assessmentId) ?? 'Asesmen',
    avgScore: Math.round(sum / n),
    submissionCount: n,
  }))

  return NextResponse.json({
    counts: {
      modules: moduleRows.length,
      materials: materialRows.length,
      blueprints: blueprintRows.length,
      assessments: assessmentRows.length,
      classes: classRows.length,
    },
    students,
    submissionCount: subRows.length,
    avgByAssessment,
  })
}
```

- [ ] **Step 2: typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add apps/web/src/app/api/analytics/route.ts
git commit -m "feat(web): GET /api/analytics — workspace-scoped aggregates (teacher-gated)"
```

---

## Task 2: `/analytics` page + nav

**Files:**
- Create: `apps/web/src/app/(app)/analytics/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: write the page (client)**

Create `apps/web/src/app/(app)/analytics/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

type Counts = { modules: number; materials: number; blueprints: number; assessments: number; classes: number }
type AvgRow = { assessmentId: string; title: string; avgScore: number; submissionCount: number }
type Analytics = { counts: Counts; students: number; submissionCount: number; avgByAssessment: AvgRow[] }

const CARD_LABELS: { key: keyof Counts; label: string }[] = [
  { key: 'modules', label: 'Modul Ajar' },
  { key: 'materials', label: 'Bahan Ajar' },
  { key: 'blueprints', label: 'Kisi-kisi' },
  { key: 'assessments', label: 'Asesmen' },
  { key: 'classes', label: 'Kelas' },
]

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat analitik...</div>
  }
  if (!data) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Gagal memuat analitik.</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">Analitik</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CARD_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-bold text-neutral-900">{data.counts[key]}</div>
            <div className="text-xs text-neutral-500">{label}</div>
          </div>
        ))}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-bold text-neutral-900">{data.students}</div>
          <div className="text-xs text-neutral-500">Murid Terdaftar</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-bold text-neutral-900">{data.submissionCount}</div>
          <div className="text-xs text-neutral-500">Pengumpulan</div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Rata-rata Nilai per Asesmen</h2>
        {data.avgByAssessment.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada pengumpulan.</p>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-neutral-600">Asesmen</th>
                  <th className="text-center px-4 py-2 font-medium text-neutral-600">Rata-rata</th>
                  <th className="text-center px-4 py-2 font-medium text-neutral-600">Pengumpulan</th>
                </tr>
              </thead>
              <tbody>
                {data.avgByAssessment.map((a) => (
                  <tr key={a.assessmentId} className="border-t border-neutral-100">
                    <td className="px-4 py-2 text-neutral-800">{a.title}</td>
                    <td className="text-center px-4 py-2 text-neutral-700">{a.avgScore}</td>
                    <td className="text-center px-4 py-2 text-neutral-700">{a.submissionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: add Analitik to the sidebar nav**

In `apps/web/src/components/sidebar.tsx`, add to `NAV_ITEMS` (after Kelas, before Pengaturan):
```tsx
  { href: '/analytics', label: 'Analitik' },
```

- [ ] **Step 3: typecheck + build (route validation)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK; `/analytics` + `/api/analytics` at correct paths.

- [ ] **Step 4: commit**

```bash
git add "apps/web/src/app/(app)/analytics/page.tsx" apps/web/src/components/sidebar.tsx
git commit -m "feat(web): workspace analytics dashboard + nav"
```

---

## Definition of Done

- [ ] `pnpm -r typecheck` all pass; `pnpm --filter @arago/web test` green.
- [ ] `next build` succeeds; analytics routes at correct paths.
- [ ] Manual (real env): teacher sees counts + students + submissions + per-assessment averages for the active workspace only; a student hitting `/api/analytics` gets 403; counts reflect only the active workspace (cross-workspace data absent).

## Self-review notes
- Spec coverage (Slice 15): teacher-gated workspace aggregates ✓ (T1: counts, students, submissionCount, avgByAssessment), `/analytics` page + nav ✓ (T2).
- Security: `requireWorkspaceTeacher(workspaceId)`; content scoped via module→workspace chain or workspaceId; submissions scoped via classAssignments→class(in workspace classIds); empty-array guards before every `inArray`. Read-only.
- Type consistency: route returns `{counts, students, submissionCount, avgByAssessment}` matching the page's `Analytics` type.
