import { NextRequest, NextResponse } from 'next/server';
import { CreateWorkspaceSchema } from '@arago/validators';
import { requireAuth } from '@/lib/auth/guards';
import { createWorkspace } from '@/lib/workspace';

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const workspace = await createWorkspace(session.user.id, parsed.data);
    return NextResponse.json(workspace, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
    }
    throw err;
  }
}
