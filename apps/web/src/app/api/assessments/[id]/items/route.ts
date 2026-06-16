import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { assessmentItems, assessments } from '@arago/db/schema'
import { eq, asc, and, isNull } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const optionSchema = z.object({ id: z.string(), text: z.string().min(1) })

const createItemSchema = z.object({
  question: z.string().min(1),
  options: z.array(optionSchema).min(2).max(6),
  correctAnswer: z.string().min(1),
  bloomLevel: z.string().optional(),
  indicatorRef: z.string().optional(),
  sortOrder: z.number().int().default(0),
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

  // Verify parent assessment is in active workspace
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .limit(1)

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const items = await db
    .select()
    .from(assessmentItems)
    .where(eq(assessmentItems.assessmentId, id))
    .orderBy(asc(assessmentItems.sortOrder), asc(assessmentItems.createdAt))

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id: assessmentId } = await params
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
  const parsed = createItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [item] = await db
    .insert(assessmentItems)
    .values({ assessmentId, ...parsed.data })
    .returning()

  if (!item) {
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  return NextResponse.json({ item }, { status: 201 })
}
