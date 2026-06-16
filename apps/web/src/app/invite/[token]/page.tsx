import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { joinWorkspaceByToken } from '@/lib/workspace';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/invite/${token}`);
  }

  const result = await joinWorkspaceByToken(token, session.user.id);

  if (!result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-xl bg-white p-8 shadow text-center">
          <h1 className="text-xl font-bold text-gray-900">Tautan Tidak Valid</h1>
          <p className="mt-2 text-sm text-gray-500">
            Tautan undangan ini tidak ditemukan atau sudah kadaluarsa.
          </p>
        </div>
      </main>
    );
  }

  redirect('/workspaces');
}
