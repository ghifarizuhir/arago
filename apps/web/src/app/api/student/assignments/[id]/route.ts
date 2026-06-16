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
