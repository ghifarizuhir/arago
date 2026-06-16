import { db } from '@arago/db/client';
import { teachingModules, assessments } from '@arago/db/schema';
import { eq, isNull, and, count, desc } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  const [moduleCountResult, assessmentCountResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(teachingModules)
      .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt))),
    db
      .select({ count: count() })
      .from(assessments)
      .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt))),
  ]);

  const moduleCount = moduleCountResult[0]?.count ?? 0;
  const assessmentCount = assessmentCountResult[0]?.count ?? 0;

  const recentModules = await db
    .select({
      id: teachingModules.id,
      title: teachingModules.title,
      status: teachingModules.status,
      createdAt: teachingModules.createdAt,
    })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
    .orderBy(desc(teachingModules.createdAt))
    .limit(5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Modul Ajar" value={moduleCount} />
        <StatCard label="Total Asesmen" value={assessmentCount} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Modul Terbaru</h2>
        {recentModules.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada modul. Buat modul pertama Anda.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentModules.map((mod) => (
              <li key={mod.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{mod.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    mod.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {mod.status === 'published' ? 'Diterbitkan' : 'Draf'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
