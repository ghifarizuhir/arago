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
import { eq, isNull, and, inArray } from 'drizzle-orm'
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

  const assignmentIds = assignmentRows.map((a) => a.id)
  const mySubs =
    assignmentIds.length === 0
      ? []
      : await db
          .select({ assignmentId: submissions.assignmentId })
          .from(submissions)
          .where(
            and(
              eq(submissions.studentId, session.user.id),
              inArray(submissions.assignmentId, assignmentIds),
            ),
          )
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
