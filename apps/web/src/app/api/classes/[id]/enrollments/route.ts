import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes, classEnrollments, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { EnrollStudentsSchema } from '@arago/validators'
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
  const parsed = EnrollStudentsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, id), eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .limit(1)
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  // Every studentId must be a student-role member of THIS workspace.
  const validRows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'student'),
        inArray(workspaceMembers.userId, parsed.data.studentIds),
      ),
    )
  const validIds = new Set(validRows.map((r) => r.userId))
  if (parsed.data.studentIds.some((sid) => !validIds.has(sid))) {
    return NextResponse.json(
      { error: 'One or more users are not student members of this workspace' },
      { status: 422 },
    )
  }

  await db
    .insert(classEnrollments)
    .values(parsed.data.studentIds.map((studentId) => ({ classId: id, studentId })))
    .onConflictDoNothing()

  return NextResponse.json({ success: true }, { status: 201 })
}
