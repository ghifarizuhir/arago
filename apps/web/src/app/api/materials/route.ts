import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const createSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1).max(500),
  content: z.string().default(''),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const moduleId = req.nextUrl.searchParams.get('moduleId')
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId is required' }, { status: 400 })
  }

  // Verify the module belongs to the active workspace
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

  const materials = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.moduleId, moduleId), isNull(teachingMaterials.deletedAt)))
    .orderBy(teachingMaterials.createdAt)

  return NextResponse.json({ materials })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { moduleId, title, content } = parsed.data

  // Verify the module belongs to the active workspace
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

  const [material] = await db
    .insert(teachingMaterials)
    .values({
      moduleId,
      creatorId: session.user.id,
      title,
      content,
      status: 'draft',
    })
    .returning()

  if (!material) {
    return NextResponse.json({ error: 'Failed to create material' }, { status: 500 })
  }

  return NextResponse.json({ material }, { status: 201 })
}
