import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classEnrollments, classMaterials, teachingMaterials, users } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

type Params = { params: Promise<{ id: string }> }

async function loadScopedClass(id: string, workspaceId: string) {
  const [cls] = await db
    .select()
    .from(classes)
    .where(
      and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)),
    )
    .limit(1)
  return cls
}

export async function GET(_req: NextRequest, { params }: Params) {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const enrolled = await db
    .select({ studentId: classEnrollments.studentId, name: users.name, email: users.email })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .where(eq(classEnrollments.classId, id))

  const materials = await db
    .select({ materialId: classMaterials.materialId, title: teachingMaterials.title })
    .from(classMaterials)
    .innerJoin(teachingMaterials, eq(classMaterials.materialId, teachingMaterials.id))
    .where(and(eq(classMaterials.classId, id), isNull(teachingMaterials.deletedAt)))

  return NextResponse.json({ class: cls, enrolled, materials })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  const { error, session } = await requireWorkspaceTeacher(workspaceId)
  if (error || !session) return error!

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  if (cls.teacherId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [updated] = await db
    .update(classes)
    .set({ name: parsed.data.name })
    .where(eq(classes.id, id))
    .returning()

  return NextResponse.json({ class: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  const { error, session } = await requireWorkspaceTeacher(workspaceId)
  if (error || !session) return error!

  const { id } = await params
  const idCheck = z.string().uuid().safeParse(id)
  if (!idCheck.success) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const cls = await loadScopedClass(id, workspaceId)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  if (cls.teacherId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.update(classes).set({ deletedAt: new Date() }).where(eq(classes.id, id))

  return NextResponse.json({ success: true })
}
