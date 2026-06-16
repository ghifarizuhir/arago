import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; materialId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  const { error, session } = await requireWorkspaceTeacher(workspaceId)
  if (error || !session) return error!

  const { id, materialId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(materialId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  await db
    .delete(classMaterials)
    .where(and(eq(classMaterials.classId, id), eq(classMaterials.materialId, materialId)))

  return NextResponse.json({ success: true })
}
