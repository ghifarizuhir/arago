import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { db } from '@arago/db/client';
import { teachingModules } from '@arago/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { extractModuleContent } from '@arago/ai';
import { extractText, isSupportedMimeType } from '@/lib/extract-text';

const BodySchema = z.object({ moduleId: z.string().uuid() });

async function downloadBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  const mimeType = contentType.split(';')[0]?.trim() ?? '';
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { moduleId } = parsed.data;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(
      and(
        eq(teachingModules.id, moduleId),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingModules.deletedAt),
      ),
    )
    .limit(1);

  if (!module_) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }

  let rawText: string;

  if (module_.fileUrl) {
    const { buffer, mimeType } = await downloadBuffer(module_.fileUrl);
    if (!isSupportedMimeType(mimeType)) {
      return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 415 });
    }
    rawText = await extractText(buffer, mimeType);
  } else if (module_.extractedText) {
    rawText = module_.extractedText;
  } else {
    return NextResponse.json({ error: 'Module has no file or text to extract' }, { status: 422 });
  }

  const extracted = await extractModuleContent(rawText);

  await db
    .update(teachingModules)
    .set({ extractedText: rawText })
    .where(
      and(
        eq(teachingModules.id, moduleId),
        eq(teachingModules.workspaceId, workspaceId),
      ),
    );

  return NextResponse.json({ summary: extracted.summary, topics: extracted.topics });
}
