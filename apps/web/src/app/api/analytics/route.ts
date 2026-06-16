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

  // Round 1: independent workspace-scoped queries
  const [moduleRows, assessmentRows, classRows] = await Promise.all([
    db
      .select({ id: teachingModules.id })
      .from(teachingModules)
      .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt))),
    db
      .select({ id: assessments.id, title: assessments.title })
      .from(assessments)
      .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt))),
    db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt))),
  ])
  const moduleIds = moduleRows.map((m) => m.id)
  const classIds = classRows.map((c) => c.id)

  // Round 2: depend on moduleIds / classIds
  const [materialRows, enrollRows, subRows] = await Promise.all([
    moduleIds.length === 0
      ? Promise.resolve([] as { id: string }[])
      : db
          .select({ id: teachingMaterials.id })
          .from(teachingMaterials)
          .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt))),
    classIds.length === 0
      ? Promise.resolve([] as { studentId: string }[])
      : db
          .select({ studentId: classEnrollments.studentId })
          .from(classEnrollments)
          .where(inArray(classEnrollments.classId, classIds)),
    classIds.length === 0
      ? Promise.resolve([] as { score: number | null; assessmentId: string }[])
      : db
          .select({ score: submissions.score, assessmentId: classAssignments.assessmentId })
          .from(submissions)
          .innerJoin(classAssignments, eq(submissions.assignmentId, classAssignments.id))
          .innerJoin(assessments, eq(classAssignments.assessmentId, assessments.id))
          .where(
            and(
              inArray(classAssignments.classId, classIds),
              isNull(classAssignments.deletedAt),
              isNull(assessments.deletedAt),
            ),
          ),
  ])
  const materialIds = materialRows.map((m) => m.id)

  // Round 3: depends on materialIds
  const blueprintRows =
    materialIds.length === 0
      ? []
      : await db
          .select({ id: blueprints.id })
          .from(blueprints)
          .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))

  const students = new Set(enrollRows.map((e) => e.studentId)).size

  // Per-assessment aggregation (JS-side): n = total submissions; avg over scored only.
  const byAssessment = new Map<string, { sum: number; n: number; scored: number }>()
  for (const s of subRows) {
    let cur = byAssessment.get(s.assessmentId)
    if (!cur) {
      cur = { sum: 0, n: 0, scored: 0 }
      byAssessment.set(s.assessmentId, cur)
    }
    cur.n += 1
    if (s.score !== null) {
      cur.sum += s.score
      cur.scored += 1
    }
  }
  const titleOf = new Map(assessmentRows.map((a) => [a.id, a.title]))
  const avgByAssessment = [...byAssessment.entries()].map(([assessmentId, { sum, n, scored }]) => ({
    assessmentId,
    title: titleOf.get(assessmentId) ?? 'Asesmen',
    avgScore: scored > 0 ? Math.round(sum / scored) : 0,
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
