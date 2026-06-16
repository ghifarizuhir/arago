import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { classes } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { CreateClassSchema } from '@arago/validators'

export async function GET(_req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const result = await db
    .select()
    .from(classes)
    .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .orderBy(desc(classes.createdAt))

  return NextResponse.json({ classes: result })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = CreateClassSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [created] = await db
    .insert(classes)
    .values({ workspaceId, teacherId: session.user.id, name: parsed.data.name })
    .returning()

  if (!created) {
    return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
  }

  return NextResponse.json({ class: created }, { status: 201 })
}
