import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@arago/db/client';
import { teachingModules, teachingMaterials } from '@arago/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { GenerateMaterialButton } from '@/components/generate-material-button';

type Props = { params: Promise<{ id: string }> };

export default async function ModuleDetailPage({ params }: Props) {
  const { id } = await params;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.id, id), isNull(teachingModules.deletedAt)))
    .limit(1);

  if (!module_) notFound();

  const materials = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.moduleId, id), isNull(teachingMaterials.deletedAt)));

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/modules" className="text-sm text-indigo-600 hover:underline">
            Modul Ajar
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{module_.title}</h1>
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              module_.status === 'published'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {module_.status === 'published' ? 'Diterbitkan' : 'Draf'}
          </span>
        </div>
        <GenerateMaterialButton moduleId={module_.id} disabled={!module_.extractedText} />
      </div>

      {module_.extractedText ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Ringkasan Konten</h2>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-6">
            {module_.extractedText.slice(0, 600)}
            {module_.extractedText.length > 600 ? '...' : ''}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
          <p className="text-sm text-gray-500">
            Belum ada konten yang diekstrak. Unggah berkas dan analisis dengan AI.
          </p>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Bahan Ajar</h2>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center">
            <p className="text-sm text-gray-500">Belum ada bahan ajar untuk modul ini.</p>
            <p className="mt-1 text-xs text-gray-400">
              Generate bahan ajar dari halaman ini (tersedia di Slice 4).
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {materials.map((mat) => (
              <li key={mat.id}>
                <Link
                  href={`/modules/${id}/materials/${mat.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{mat.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      mat.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {mat.status === 'published' ? 'Diterbitkan' : 'Draf'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
