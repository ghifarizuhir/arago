import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { workspaceMembers, users } from '@arago/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export async function GET(_req: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  const { error } = await requireWorkspaceTeacher(workspaceId)
  if (error) return error

  const members = await db
    .select({ userId: workspaceMembers.userId, name: users.name, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'student')))

  return NextResponse.json({ members })
}
