import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const [material] = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      content: teachingMaterials.content,
    })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, teachingModules.workspaceId))
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(workspaceMembers.userId, session.user.id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json({ material })
}
