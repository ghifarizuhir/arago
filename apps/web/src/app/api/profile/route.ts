import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { users, workspaces } from '@arago/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [updated] = await db
    .update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, session.user.id))
    .returning({ id: users.id, name: users.name })

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ user: updated })
}

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!
  const [me] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1)
  const workspaceId = await getCurrentWorkspaceId()
  let workspace: { id: string; name: string } | null = null
  if (workspaceId && z.string().uuid().safeParse(workspaceId).success) {
    const [w] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
    workspace = w ?? null
  }
  return NextResponse.json({ user: me ?? null, workspace })
}

