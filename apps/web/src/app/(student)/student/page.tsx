import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { assessments, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export default async function StudentDashboardPage() {
  const { error, session } = await requireAuth()
  if (error || !session) return redirect('/login')

  const memberships = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, session.user.id))

  const workspaceIds = memberships.map((m) => m.workspaceId)

  const publishedAssessments =
    workspaceIds.length === 0
      ? []
      : await db
          .select()
          .from(assessments)
          .where(
            and(
              inArray(assessments.workspaceId, workspaceIds),
              eq(assessments.status, 'published'),
              isNull(assessments.deletedAt),
            ),
          )
          .orderBy(assessments.createdAt)

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Asesmen Tersedia</h1>

      {publishedAssessments.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">Belum ada asesmen yang tersedia.</div>
      ) : (
        <ul className="space-y-3">
          {publishedAssessments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/student/assessments/${a.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{a.title}</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Diterbitkan
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
