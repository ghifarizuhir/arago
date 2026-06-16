import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { notifications } from '@arago/db/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const recent = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(20)

  const unread = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)))

  return NextResponse.json({ notifications: recent, unreadCount: unread.length })
}
