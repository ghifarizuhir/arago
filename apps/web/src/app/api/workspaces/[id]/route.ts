import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { workspaces } from '@arago/db/schema'
import { eq } from 'drizzle-orm'
import { requireWorkspaceTeacher } from '@/lib/auth/guards'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().min(1).max(255) })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const { error, session } = await requireWorkspaceTeacher(id)
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [updated] = await db
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, id))
    .returning({ id: workspaces.id, name: workspaces.name })

  if (!updated) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  return NextResponse.json({ workspace: updated })
}
