import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { classes } from '@arago/db/schema'
import { eq, isNull, and, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function ClassesPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const allClasses = await db
    .select()
    .from(classes)
    .where(and(eq(classes.workspaceId, workspaceId), isNull(classes.deletedAt)))
    .orderBy(desc(classes.createdAt))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Kelas</h1>
        <Link
          href="/classes/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Kelas Baru
        </Link>
      </div>

      {allClasses.length === 0 ? (
        <div className="text-center py-16 text-neutral-400 text-sm">
          Belum ada kelas. Buat kelas baru untuk memulai.
        </div>
      ) : (
        <ul className="space-y-3">
          {allClasses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/classes/${c.id}`}
                className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
              >
                <span className="font-medium text-neutral-900">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
