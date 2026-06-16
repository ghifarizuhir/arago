import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classMaterials, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { AssignMaterialsSchema } from '@arago/validators'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = AssignMaterialsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // Every materialId must be a published, non-deleted material in THIS workspace.
  const validRows = await db
    .select({ id: teachingMaterials.id })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        inArray(teachingMaterials.id, parsed.data.materialIds),
        eq(teachingModules.workspaceId, workspaceId),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
        isNull(teachingModules.deletedAt),
      ),
    )
  const validIds = new Set(validRows.map((r) => r.id))
  if (parsed.data.materialIds.some((mid) => !validIds.has(mid))) {
    return NextResponse.json(
      { error: 'One or more materials are not published materials in this workspace' },
      { status: 422 },
    )
  }

  await db
    .insert(classMaterials)
    .values(parsed.data.materialIds.map((materialId) => ({ classId: id, materialId })))
    .onConflictDoNothing()

  return NextResponse.json({ success: true }, { status: 201 })
}
