import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const indicatorSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  bloomLevel: z.string().min(1),
  competency: z.string().min(1),
})

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']).optional(),
  indicators: z.array(indicatorSchema).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const { id } = await params

  const result = await db
    .select({
      blueprints: blueprints,
    })
    .from(blueprints)
    .innerJoin(teachingMaterials, eq(blueprints.materialId, teachingMaterials.id))
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(blueprints.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(blueprints.deletedAt),
      ),
    )
    .limit(1)

  const [row] = result

  if (!row) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  return NextResponse.json({ blueprint: row.blueprints })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

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

  // Verify the blueprint belongs to a module in the active workspace
  const result = await db
    .select({
      blueprints: blueprints,
    })
    .from(blueprints)
    .innerJoin(teachingMaterials, eq(blueprints.materialId, teachingMaterials.id))
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(blueprints.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(blueprints.deletedAt),
      ),
    )
    .limit(1)

  const [row] = result

  if (!row) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  const [updated] = await db
    .update(blueprints)
    .set(parsed.data)
    .where(eq(blueprints.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update blueprint' }, { status: 500 })
  }

  return NextResponse.json({ blueprint: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const { id } = await params

  // Verify the blueprint belongs to a module in the active workspace
  const result = await db
    .select({
      blueprints: blueprints,
    })
    .from(blueprints)
    .innerJoin(teachingMaterials, eq(blueprints.materialId, teachingMaterials.id))
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(blueprints.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(blueprints.deletedAt),
      ),
    )
    .limit(1)

  const [row] = result

  if (!row) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  await db
    .update(blueprints)
    .set({ deletedAt: new Date() })
    .where(eq(blueprints.id, id))

  return NextResponse.json({ success: true })
}
