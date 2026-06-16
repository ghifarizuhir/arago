import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingModules, teachingMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { generateMaterial } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  moduleId: z.string().uuid(),
  topic: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { moduleId, topic } = parsed.data

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(
      and(
        eq(teachingModules.id, moduleId),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingModules.deletedAt),
      ),
    )
    .limit(1)

  if (!module_) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  }

  if (!module_.extractedText) {
    return NextResponse.json({ error: 'Module has no extracted text' }, { status: 422 })
  }

  const generated = await generateMaterial(module_.title, module_.extractedText, topic)

  const [material] = await db
    .insert(teachingMaterials)
    .values({
      moduleId,
      creatorId: session.user.id,
      title: generated.title,
      content: generated.content,
      status: 'draft',
    })
    .returning()

  if (!material) {
    return NextResponse.json({ error: 'Failed to create material' }, { status: 500 })
  }

  return NextResponse.json({ material }, { status: 201 })
}
