import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceMember } from '@/lib/auth/guards';
import { cookies } from 'next/headers';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { error } = await requireWorkspaceMember(id);
  if (error) return error;

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true });
}
