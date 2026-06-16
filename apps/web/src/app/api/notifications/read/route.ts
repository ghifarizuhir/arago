import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { notifications } from '@arago/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const bodySchema = z.object({ id: z.string().uuid().optional() })

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const now = new Date()
  if (parsed.data.id) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, parsed.data.id), eq(notifications.userId, session.user.id)))
  } else {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))
  }

  return NextResponse.json({ success: true })
}
