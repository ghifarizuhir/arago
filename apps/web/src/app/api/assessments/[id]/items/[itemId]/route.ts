import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessmentItems, assessments } from '@arago/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const optionSchema = z.object({ id: z.string(), text: z.string().min(1) })

const patchItemSchema = z.object({
  question: z.string().min(1).optional(),
  options: z.array(optionSchema).min(2).max(6).optional(),
  correctAnswer: z.string().min(1).optional(),
  bloomLevel: z.string().optional(),
  indicatorRef: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId, itemId } = await params
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  // Verify parent assessment is in active workspace
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(assessmentItems)
    .where(and(eq(assessmentItems.id, itemId), eq(assessmentItems.assessmentId, assessmentId)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const [updated] = await db
    .update(assessmentItems)
    .set(parsed.data)
    .where(eq(assessmentItems.id, itemId))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }

  return NextResponse.json({ item: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId, itemId } = await params
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  // Verify parent assessment is in active workspace
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const [existing] = await db
    .select()
    .from(assessmentItems)
    .where(and(eq(assessmentItems.id, itemId), eq(assessmentItems.assessmentId, assessmentId)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  await db.delete(assessmentItems).where(eq(assessmentItems.id, itemId))

  return NextResponse.json({ success: true })
}
