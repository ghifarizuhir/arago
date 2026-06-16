import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const { id } = await params

  const [material] = await db
    .select()
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json({ material: material.teaching_materials })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Get existing material and verify ownership and workspace
  const [existing] = await db
    .select()
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (existing.teaching_materials.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [updated] = await db
    .update(teachingMaterials)
    .set(parsed.data)
    .where(eq(teachingMaterials.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update material' }, { status: 500 })
  }

  return NextResponse.json({ material: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const { id } = await params

  // Get existing material and verify ownership and workspace
  const [existing] = await db
    .select()
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (existing.teaching_materials.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db
    .update(teachingMaterials)
    .set({ deletedAt: new Date() })
    .where(eq(teachingMaterials.id, id))

  return NextResponse.json({ success: true })
}
