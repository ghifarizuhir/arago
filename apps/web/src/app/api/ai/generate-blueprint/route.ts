import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, blueprints } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { generateBlueprint } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  materialId: z.string().uuid(),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']),
})

export async function POST(req: NextRequest) {
  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, curriculumType } = parsed.data

  // Verify the material belongs to a module in the active workspace
  const [material] = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      content: teachingMaterials.content,
      moduleId: teachingMaterials.moduleId,
    })
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

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (!material.content) {
    return NextResponse.json({ error: 'Material has no content' }, { status: 422 })
  }

  const generated = await generateBlueprint(material.title, material.content, curriculumType)

  const [blueprint] = await db
    .insert(blueprints)
    .values({
      materialId,
      creatorId: session.user.id,
      title: generated.title,
      curriculumType,
      indicators: generated.indicators,
    })
    .returning()

  if (!blueprint) {
    return NextResponse.json({ error: 'Failed to create blueprint' }, { status: 500 })
  }

  return NextResponse.json({ blueprint }, { status: 201 })
}
