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

  try {
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
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }
    throw err
  }
}
