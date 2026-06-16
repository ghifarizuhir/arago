import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessments, assessmentItems, assessmentBlueprints } from '@arago/db/schema'
import { eq, isNull, and, asc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, id),
        eq(assessments.workspaceId, workspaceId),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const items = await db
    .select()
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, id))
    .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))

  const bpLinks = await db
    .select()
    .from(assessmentBlueprints)
    .where(eq(assessmentBlueprints.assessmentId, id))

  return NextResponse.json({
    assessment,
    items,
    blueprintIds: bpLinks.map((l) => l.blueprintId),
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, id),
        eq(assessments.workspaceId, workspaceId),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [updated] = await db
    .update(assessments)
    .set(parsed.data)
    .where(eq(assessments.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update assessment' }, { status: 500 })
  }

  return NextResponse.json({ assessment: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const [existing] = await db
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, id),
        eq(assessments.workspaceId, workspaceId),
        isNull(assessments.deletedAt),
      ),
    )
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db
    .update(assessments)
    .set({ deletedAt: new Date() })
    .where(eq(assessments.id, id))

  return NextResponse.json({ success: true })
}
