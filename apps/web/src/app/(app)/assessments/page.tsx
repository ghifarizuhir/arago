import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { assessments } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function AssessmentsPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const allAssessments = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt)))
    .orderBy(desc(assessments.createdAt))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Asesmen</h1>
        <Link
          href="/assessments/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Asesmen Baru
        </Link>
      </div>

      {allAssessments.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">
          Belum ada asesmen. Buat asesmen baru untuk memulai.
        </div>
      ) : (
        <ul className="space-y-3">
          {allAssessments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/assessments/${a.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{a.title}</span>
                <span
                  className={[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    a.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
                  ].join(' ')}
                >
                  {a.status === 'published' ? 'Diterbitkan' : 'Draft'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
