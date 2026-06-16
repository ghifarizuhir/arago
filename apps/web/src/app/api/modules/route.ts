import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { db } from '@arago/db/client';
import { teachingModules } from '@arago/db/schema';
import { eq, isNull, and, desc } from 'drizzle-orm';

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  fileUrl: z.string().url().optional(),
});

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const modules = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
    .orderBy(desc(teachingModules.createdAt));

  return NextResponse.json({ modules });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error: authError, session } = await requireAuth();
  if (authError || !session) return authError!;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [newModule] = await db
    .insert(teachingModules)
    .values({
      workspaceId,
      creatorId: session.user.id,
      title: parsed.data.title,
      fileUrl: parsed.data.fileUrl ?? null,
      status: 'draft',
    })
    .returning();

  if (!newModule) {
    return NextResponse.json({ error: 'Failed to create module' }, { status: 500 });
  }

  return NextResponse.json({ module: newModule }, { status: 201 });
}
