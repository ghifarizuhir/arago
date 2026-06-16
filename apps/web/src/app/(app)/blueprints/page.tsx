import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function BlueprintsPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const modules = await db
    .select({ id: teachingModules.id, title: teachingModules.title })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))

  const moduleIds = modules.map((m) => m.id)

  const materials =
    moduleIds.length === 0
      ? []
      : await db
          .select({
            id: teachingMaterials.id,
            title: teachingMaterials.title,
            moduleId: teachingMaterials.moduleId,
          })
          .from(teachingMaterials)
          .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt)))

  const materialIds = materials.map((m) => m.id)

  const allBlueprints =
    materialIds.length === 0
      ? []
      : await db
          .select()
          .from(blueprints)
          .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))
          .orderBy(blueprints.createdAt)

  const materialMap = new Map(materials.map((m) => [m.id, m]))
  const moduleMap = new Map(modules.map((m) => [m.id, m]))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Kisi-kisi</h1>

      {allBlueprints.length === 0 ? (
        <div className="text-center py-16 text-neutral-400">
          <p className="text-sm">Belum ada kisi-kisi. Generate dari halaman materi.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {allBlueprints.map((bp) => {
            const material = materialMap.get(bp.materialId)
            const moduleRef = material ? moduleMap.get(material.moduleId) : undefined
            const indicatorCount = Array.isArray(bp.indicators) ? bp.indicators.length : 0
            return (
              <li key={bp.id}>
                <Link
                  href={`/blueprints/${bp.id}`}
                  className="block p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-neutral-900">{bp.title}</p>
                      <p className="text-sm text-neutral-500 mt-0.5">
                        {moduleRef?.title} › {material?.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                        {bp.curriculumType}
                      </span>
                      <span className="text-xs text-neutral-400">{indicatorCount} indikator</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
