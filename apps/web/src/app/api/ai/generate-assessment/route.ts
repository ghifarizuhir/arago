import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentBlueprints, blueprints, assessmentItems } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { generateAssessment } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({ assessmentId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { assessmentId } = parsed.data

  // Verify assessment is in active workspace
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, assessmentId),
        eq(assessments.workspaceId, workspaceId),
        isNull(assessments.deletedAt),
      ),
    )
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
