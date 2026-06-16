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

  if (!assessment) {
    return NextResponse.json({ error: 'Failed to create assessment' }, { status: 500 })
  }

  await db.insert(assessmentBlueprints).values(
    blueprintIds.map((bpId) => ({ assessmentId: assessment.id, blueprintId: bpId })),
  )

  return NextResponse.json({ assessment }, { status: 201 })
}
