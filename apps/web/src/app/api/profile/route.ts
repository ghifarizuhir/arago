import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { users } from '@arago/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
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
