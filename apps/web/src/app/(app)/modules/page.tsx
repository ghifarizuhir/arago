import Link from 'next/link';
import { db } from '@arago/db/client';
import { teachingModules } from '@arago/db/schema';
import { eq, isNull, and, desc } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { redirect } from 'next/navigation';

export default async function ModulesPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  const modules = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
    .orderBy(desc(teachingModules.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Modul Ajar</h1>
        <Link
          href="/modules/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Modul Baru
        </Link>
      </div>

      {modules.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-500">Belum ada modul ajar.</p>
          <Link href="/modules/new" className="mt-2 inline-block text-indigo-600 hover:underline">
            Buat modul pertama Anda
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {modules.map((mod) => (
            <li key={mod.id}>
              <Link
                href={`/modules/${mod.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{mod.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(mod.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    mod.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {mod.status === 'published' ? 'Diterbitkan' : 'Draf'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
