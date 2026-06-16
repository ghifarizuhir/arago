import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentItems, submissions, workspaceMembers } from '@arago/db/schema'
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

  // student must be a member of the assessment's workspace
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.workspaceId, assessment.workspaceId),
      eq(workspaceMembers.userId, session.user.id),
    ))
    .limit(1)
  if (!membership) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
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

  if (!submission) {
    return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
  }

  return NextResponse.json({ submissionId: submission.id, score, totalItems }, { status: 201 })
}
