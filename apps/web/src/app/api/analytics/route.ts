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
