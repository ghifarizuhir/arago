import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classAssignments } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

type Params = { params: Promise<{ id: string; assignmentId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, assignmentId } = await params
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(assignmentId).success) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  // class must be in workspace; assignment must belong to the class.
  const [row] = await db
    .select({ id: classAssignments.id })
    .from(classAssignments)
    .innerJoin(classes, eq(classAssignments.classId, classes.id))
    .where(
      and(
        eq(classAssignments.id, assignmentId),
        eq(classAssignments.classId, id),
        eq(classes.workspaceId, workspaceId),
        isNull(classes.deletedAt),
        isNull(classAssignments.deletedAt),
      ),
    )
    .limit(1)
  if (!row) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  await db.update(classAssignments).set({ deletedAt: new Date() }).where(eq(classAssignments.id, assignmentId))

  return NextResponse.json({ success: true })
}
