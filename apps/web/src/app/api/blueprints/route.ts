import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const indicatorSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  bloomLevel: z.string().min(1),
  competency: z.string().min(1),
})

const createSchema = z.object({
  materialId: z.string().uuid(),
  title: z.string().min(1).max(500),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']),
  indicators: z.array(indicatorSchema).default([]),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const materialId = req.nextUrl.searchParams.get('materialId')
  if (!materialId) {
    return NextResponse.json({ error: 'materialId is required' }, { status: 400 })
  }

  // Verify the material belongs to a module in the active workspace
  const [materialCheck] = await db
    .select({ moduleId: teachingMaterials.moduleId })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!materialCheck) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const result = await db
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.materialId, materialId), isNull(blueprints.deletedAt)))
    .orderBy(blueprints.createdAt)

  return NextResponse.json({ blueprints: result })
}

export async function POST(req: NextRequest) {
  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, ...rest } = parsed.data

  // Verify the material belongs to a module in the active workspace
  const [materialCheck] = await db
    .select({ moduleId: teachingMaterials.moduleId })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!materialCheck) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const [blueprint] = await db
    .insert(blueprints)
    .values({ materialId, creatorId: session.user.id, ...rest })
    .returning()

  if (!blueprint) {
    return NextResponse.json({ error: 'Failed to create blueprint' }, { status: 500 })
  }

  return NextResponse.json({ blueprint }, { status: 201 })
}
