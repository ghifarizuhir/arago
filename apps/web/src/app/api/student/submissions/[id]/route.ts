import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { submissions } from '@arago/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const [submission] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.studentId, session.user.id)))
    .limit(1)

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  return NextResponse.json({ submission })
}
