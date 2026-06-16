import { db } from '@arago/db/client';
import { workspaces, workspaceMembers } from '@arago/db/schema';
import { eq, and } from 'drizzle-orm';
import type { CreateWorkspaceSchema } from '@arago/validators';
import type { z } from 'zod';

export type WorkspaceData = z.infer<typeof CreateWorkspaceSchema>;

export function generateInviteToken(): string {
  return crypto.randomUUID();
}

export async function createWorkspace(
  userId: string,
  data: WorkspaceData,
): Promise<typeof workspaces.$inferSelect> {
  const inviteToken = generateInviteToken();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: data.name,
      slug: data.slug,
      ownerId: userId,
      inviteToken,
    })
    .returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'owner',
  });

  return workspace;
}

export async function getUserWorkspaces(
  userId: string,
): Promise<(typeof workspaces.$inferSelect)[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return rows.map((r) => r.workspace);
}

export async function getWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<typeof workspaceMembers.$inferSelect | null> {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function joinWorkspaceByToken(
  token: string,
  userId: string,
): Promise<{ workspace: typeof workspaces.$inferSelect; alreadyMember: boolean } | null> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.inviteToken, token))
    .limit(1);

  if (!workspace) return null;

  const existing = await getWorkspaceMember(workspace.id, userId);
  if (existing) return { workspace, alreadyMember: true };

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'student',
  });

  return { workspace, alreadyMember: false };
}
