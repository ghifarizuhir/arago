import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const modules = await db
    .select({ id: teachingModules.id })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))

  const moduleIds = modules.map((m) => m.id)
  if (moduleIds.length === 0) return NextResponse.json({ blueprints: [] })

  const materials = await db
    .select({ id: teachingMaterials.id })
    .from(teachingMaterials)
    .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt)))

  const materialIds = materials.map((m) => m.id)
  if (materialIds.length === 0) return NextResponse.json({ blueprints: [] })

  const rows = await db
    .select({
      id: blueprints.id,
      title: blueprints.title,
      curriculumType: blueprints.curriculumType,
      materialId: blueprints.materialId,
    })
    .from(blueprints)
    .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))
    .orderBy(blueprints.createdAt)

  return NextResponse.json({ blueprints: rows })
}
