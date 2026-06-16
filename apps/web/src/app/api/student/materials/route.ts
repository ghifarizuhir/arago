import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const rows = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      moduleId: teachingMaterials.moduleId,
    })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, teachingModules.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, session.user.id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
      ),
    )

  return NextResponse.json({ materials: rows })
}
