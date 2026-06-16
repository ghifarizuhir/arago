import { NextResponse } from 'next/server';
import { auth } from './index';
import { db } from '@arago/db/client';
import { workspaceMembers } from '@arago/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Session } from 'next-auth';

type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;

interface AuthResult {
  session: Session | null;
  error: NextResponse | null;
}

interface MemberResult {
  session: Session | null;
  member: WorkspaceMemberRow | null;
  error: NextResponse | null;
}

export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session, error: null };
}

export async function requireWorkspaceMember(
  workspaceId: string,
): Promise<MemberResult> {
  const { session, error } = await requireAuth();
  if (error || !session) return { session: null, member: null, error };

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!member) {
    return {
      session,
      member: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { session, member, error: null };
}

export async function requireWorkspaceTeacher(
  workspaceId: string,
): Promise<MemberResult> {
  const { session, member, error } = await requireWorkspaceMember(workspaceId);
  if (error || !session || !member) return { session, member: null, error };

  if (member.role !== 'teacher' && member.role !== 'owner') {
    return {
      session,
      member,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { session, member, error: null };
}
