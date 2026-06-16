import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { db } from '@arago/db/client';
import { teachingModules } from '@arago/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

const PatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'published']).optional(),
  fileUrl: z.string().url().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const { id } = await ctx.params;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(
      and(
        eq(teachingModules.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingModules.deletedAt),
      ),
    )
    .limit(1);

  if (!module_) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ module: module_ });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(teachingModules)
    .set(parsed.data)
    .where(
      and(
        eq(teachingModules.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingModules.deletedAt),
      ),
    )
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ module: updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const { id } = await ctx.params;

  const [deleted] = await db
    .update(teachingModules)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(teachingModules.id, id),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingModules.deletedAt),
      ),
    )
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
