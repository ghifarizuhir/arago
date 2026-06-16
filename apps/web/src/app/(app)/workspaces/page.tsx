import { auth } from '@/lib/auth';
import { getUserWorkspaces } from '@/lib/workspace';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const workspaceList = await getUserWorkspaces(session.user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Workspace Anda</h1>
          <Link
            href="/workspaces/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Buat Baru
          </Link>
        </div>

        {workspaceList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-gray-500">Anda belum bergabung dengan workspace apapun.</p>
            <Link
              href="/workspaces/new"
              className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Buat Workspace Pertama
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {workspaceList.map((ws) => (
              <li key={ws.id}>
                <form
                  action={async () => {
                    'use server';
                    const { cookies } = await import('next/headers');
                    const { redirect: redir } = await import('next/navigation');
                    const cookieStore = await cookies();
                    cookieStore.set(WORKSPACE_COOKIE, ws.id, {
                      httpOnly: true,
                      sameSite: 'lax',
                      path: '/',
                      maxAge: 60 * 60 * 24 * 30,
                    });
                    redir('/dashboard');
                  }}
                >
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{ws.name}</p>
                      <p className="text-sm text-gray-400">/{ws.slug}</p>
                    </div>
                    <span className="text-gray-400">→</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
