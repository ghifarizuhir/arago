import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { notifications } from '@arago/db/schema'
import { eq, and, isNull, desc, count } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const [recent, [unreadRow]] = await Promise.all([
    db.select({ id: notifications.id, type: notifications.type, message: notifications.message, linkPath: notifications.linkPath, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, session.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20),
    db.select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, session.user.id), isNull(notifications.readAt))),
  ])
  return NextResponse.json({ notifications: recent, unreadCount: unreadRow?.value ?? 0 })
}
