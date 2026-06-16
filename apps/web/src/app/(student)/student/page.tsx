import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
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

  const publishedMaterials =
    workspaceIds.length === 0
      ? []
      : await db
          .select({ id: teachingMaterials.id, title: teachingMaterials.title })
          .from(teachingMaterials)
          .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
          .where(
            and(
              inArray(teachingModules.workspaceId, workspaceIds),
              eq(teachingMaterials.status, 'published'),
              isNull(teachingMaterials.deletedAt),
              isNull(teachingModules.deletedAt),
            ),
          )
          .orderBy(teachingMaterials.createdAt)

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Bahan Ajar</h2>
        {publishedMaterials.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2">
            {publishedMaterials.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/student/materials/${m.id}`}
                  className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800 transition-colors"
                >
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
