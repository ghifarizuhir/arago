import { cookies } from 'next/headers';

export const WORKSPACE_COOKIE = 'arago-workspace-id';

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;
}
