import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@arago/db/client';
import { workspaces } from '@arago/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { getWorkspaceMember } from '@/lib/workspace';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  const member = await getWorkspaceMember(workspaceId, session.user.id);
  if (!member) redirect('/workspaces');

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) redirect('/workspaces');

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar workspaceName={workspace.name} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
