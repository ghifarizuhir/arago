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
