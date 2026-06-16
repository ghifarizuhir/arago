# Arago Phase 1 — Slice 3: AI Engine & Modul Ajar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher can upload a PDF/DOCX module, have AI extract its text + summary + topics, and manage modules (list/create/detail/soft-delete).

**Architecture:** `@arago/ai` wraps Vercel AI SDK `generateObject` behind a swappable provider (Anthropic default, OpenAI optional) with 3× retry. The web app stores uploads in Supabase Storage, extracts text with pdf-parse/mammoth, and persists `extractedText` on the module row.

**Tech Stack:** Vercel AI SDK v4, `@ai-sdk/anthropic`, `@ai-sdk/openai`, pdf-parse, mammoth, Supabase Storage, Vitest (mocked models — zero real API calls).

**Slice sequence:** Slice 3 of 5. Requires Slices 1–2. Run before Slice 4.

**Reconciliation note:** The module PATCH schema accepts `fileUrl` (the new-module flow PATCHes it after upload). All workspace-scoped queries use `and(eq(...), isNull(...))` — never the JS `&&` short-circuit.

**Prerequisite (manual):** In Supabase, create a Storage bucket named `modules` (public read). Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env.local`.

---

### Task 1: AI Package

**Files:**
- Create: `packages/ai/src/providers/index.ts`
- Create: `packages/ai/src/schemas/index.ts`
- Create: `packages/ai/src/extract.ts`
- Create: `packages/ai/src/generate-material.ts`
- Create: `packages/ai/src/generate-blueprint.ts`
- Create: `packages/ai/src/generate-assessment.ts`
- Create: `packages/ai/src/index.ts`
- Test: `packages/ai/__tests__/ai.test.ts`
- Create: `packages/ai/vitest.config.ts`

- [ ] **Step 1.1: Vitest config** — `packages/ai/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```
Expected: `pnpm --filter @arago/ai test` runs the package's tests.

- [ ] **Step 1.2: Provider factory** — `packages/ai/src/providers/index.ts`
```typescript
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

type Provider = 'anthropic' | 'openai';

let _provider: Provider = (process.env.AI_PROVIDER as Provider) ?? 'anthropic';

export function setProvider(p: Provider): void {
  _provider = p;
}

export function getModel(): LanguageModelV1 {
  if (_provider === 'openai') {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai('gpt-4o') as LanguageModelV1;
  }
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic('claude-sonnet-4-5') as LanguageModelV1;
}
```
Expected: `getModel()` returns a `LanguageModelV1` for both providers.

- [ ] **Step 1.3: Zod schemas** — `packages/ai/src/schemas/index.ts`
```typescript
import { z } from 'zod';

export const ExtractedModuleSchema = z.object({
  summary: z.string().describe('Concise summary of the teaching module content'),
  topics: z.array(z.string()).describe('List of main topics covered in the module'),
});

export const GeneratedMaterialSchema = z.object({
  title: z.string().describe('Title of the teaching material'),
  content: z.string().describe('HTML content suitable for rendering in Tiptap editor'),
});

export const GeneratedBlueprintSchema = z.object({
  title: z.string().describe('Title of the assessment blueprint'),
  indicators: z.array(
    z.object({
      id: z.string().describe('Unique identifier for this indicator'),
      description: z.string().describe('What students should be able to do'),
      bloomLevel: z.string().describe('Bloom taxonomy level: C1, C2, C3, C4, C5, or C6'),
      competency: z.string().describe('Core competency this indicator maps to'),
    })
  ),
});

export const GeneratedAssessmentSchema = z.object({
  items: z.array(
    z.object({
      question: z.string().describe('The question text'),
      options: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
        })
      ).length(4).describe('Exactly 4 answer options'),
      correctAnswer: z.string().describe('The id of the correct option'),
      bloomLevel: z.string().describe('Bloom taxonomy level for this question'),
      indicator: z.string().describe('The indicator id this question addresses'),
    })
  ),
});

export type ExtractedModule = z.infer<typeof ExtractedModuleSchema>;
export type GeneratedMaterial = z.infer<typeof GeneratedMaterialSchema>;
export type GeneratedBlueprint = z.infer<typeof GeneratedBlueprintSchema>;
export type GeneratedAssessment = z.infer<typeof GeneratedAssessmentSchema>;
export type Indicator = GeneratedBlueprint['indicators'][number];
```
Expected: All schemas parse valid objects and reject invalid ones.

- [ ] **Step 1.4: Module extractor** — `packages/ai/src/extract.ts`
```typescript
import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { ExtractedModuleSchema, type ExtractedModule } from './schemas/index.js';

async function attempt(text: string): Promise<ExtractedModule> {
  const { object } = await generateObject({
    model: getModel(),
    schema: ExtractedModuleSchema,
    prompt: `You are an expert Indonesian K-12 curriculum analyst.
Analyze the following teaching module text and extract:
1. A concise summary (2-3 sentences) in Indonesian
2. A list of main topics covered

Teaching module text:
${text}`,
  });
  return object;
}

export async function extractModuleContent(text: string): Promise<ExtractedModule> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(text);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```
Expected: Returns `{ summary, topics }`; retries up to 3 attempts.

- [ ] **Step 1.5: Material generator** — `packages/ai/src/generate-material.ts`
```typescript
import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { GeneratedMaterialSchema, type GeneratedMaterial } from './schemas/index.js';

async function attempt(
  moduleTitle: string,
  extractedText: string,
  topic?: string
): Promise<GeneratedMaterial> {
  const topicClause = topic ? `Focus specifically on the topic: "${topic}".` : '';
  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedMaterialSchema,
    prompt: `You are an expert Indonesian K-12 curriculum designer.
Create a comprehensive teaching material (Bahan Ajar) based on the module below.
${topicClause}
Output the content as valid HTML (use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em> tags).
The content should be structured, educational, and appropriate for Indonesian K-12 students.

Module title: ${moduleTitle}
Module content:
${extractedText}`,
  });
  return object;
}

export async function generateMaterial(
  moduleTitle: string,
  extractedText: string,
  topic?: string
): Promise<GeneratedMaterial> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(moduleTitle, extractedText, topic);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```
Expected: Returns `{ title, content }` where content is valid HTML.

- [ ] **Step 1.6: Blueprint generator** — `packages/ai/src/generate-blueprint.ts`
```typescript
import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { GeneratedBlueprintSchema, type GeneratedBlueprint } from './schemas/index.js';

async function attempt(
  materialTitle: string,
  content: string,
  curriculumType: string
): Promise<GeneratedBlueprint> {
  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedBlueprintSchema,
    prompt: `You are an expert Indonesian K-12 assessment designer.
Create an assessment blueprint (Kisi-kisi) for the teaching material below.
Curriculum type: ${curriculumType}
Generate 5-8 indicators covering a range of Bloom's taxonomy levels (C1 through C6).
Each indicator must have a unique id (e.g. "IND-001"), a clear description of what students can do,
the Bloom level (C1, C2, C3, C4, C5, or C6), and the core competency it maps to.

Material title: ${materialTitle}
Material content:
${content}`,
  });
  return object;
}

export async function generateBlueprint(
  materialTitle: string,
  content: string,
  curriculumType: string
): Promise<GeneratedBlueprint> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(materialTitle, content, curriculumType);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```
Expected: Returns blueprint with 5-8 indicators spanning multiple Bloom levels.

- [ ] **Step 1.7: Assessment generator** — `packages/ai/src/generate-assessment.ts`
```typescript
import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import {
  GeneratedAssessmentSchema,
  type GeneratedAssessment,
  type Indicator,
} from './schemas/index.js';

async function attempt(
  blueprintTitle: string,
  indicators: Indicator[],
  itemCount: number
): Promise<GeneratedAssessment> {
  const indicatorList = indicators
    .map((ind) => `- [${ind.id}] (${ind.bloomLevel}) ${ind.description}`)
    .join('\n');

  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedAssessmentSchema,
    prompt: `You are an expert Indonesian K-12 assessment designer.
Create ${itemCount} multiple-choice questions for the assessment below.
Each question must:
- Have exactly 4 options (ids: "A", "B", "C", "D")
- Specify the correct answer id
- Map to one of the provided indicators
- Reflect the Bloom's taxonomy level of that indicator

Blueprint title: ${blueprintTitle}
Indicators:
${indicatorList}`,
  });
  return object;
}

export async function generateAssessment(
  blueprintTitle: string,
  indicators: Indicator[],
  itemCount: number = 10
): Promise<GeneratedAssessment> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(blueprintTitle, indicators, itemCount);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```
Expected: Returns `{ items }` array with `itemCount` questions, each with 4 options.

- [ ] **Step 1.8: Package index** — `packages/ai/src/index.ts`
```typescript
export { getModel, setProvider } from './providers/index.js';
export {
  ExtractedModuleSchema,
  GeneratedMaterialSchema,
  GeneratedBlueprintSchema,
  GeneratedAssessmentSchema,
} from './schemas/index.js';
export type {
  ExtractedModule,
  GeneratedMaterial,
  GeneratedBlueprint,
  GeneratedAssessment,
  Indicator,
} from './schemas/index.js';
export { extractModuleContent } from './extract.js';
export { generateMaterial } from './generate-material.js';
export { generateBlueprint } from './generate-blueprint.js';
export { generateAssessment } from './generate-assessment.js';
```
Expected: All symbols importable from `@arago/ai`.

- [ ] **Step 1.9: Tests (mocked)** — `packages/ai/__tests__/ai.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest';
import { MockLanguageModelV1 } from 'ai/test';
import { extractModuleContent } from '../src/extract.js';
import { generateMaterial } from '../src/generate-material.js';
import { generateBlueprint } from '../src/generate-blueprint.js';
import { generateAssessment } from '../src/generate-assessment.js';
import * as providers from '../src/providers/index.js';

function makeMockModel(responseObject: unknown): MockLanguageModelV1 {
  return new MockLanguageModelV1({
    defaultObjectGenerationMode: 'json',
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify(responseObject),
    }),
  });
}

describe('@arago/ai', () => {
  describe('extractModuleContent', () => {
    it('returns summary and topics from model response', async () => {
      const mockResponse = {
        summary: 'Modul ini membahas persamaan linear.',
        topics: ['Persamaan linear satu variabel', 'Penyelesaian persamaan'],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await extractModuleContent('Matematika kelas 7: persamaan linear...');
      expect(result.summary).toBe('Modul ini membahas persamaan linear.');
      expect(result.topics).toHaveLength(2);
      expect(result.topics[0]).toBe('Persamaan linear satu variabel');
    });

    it('retries on failure and eventually throws after 3 attempts', async () => {
      let callCount = 0;
      const failModel = new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => {
          callCount++;
          throw new Error('Model unavailable');
        },
      });
      vi.spyOn(providers, 'getModel').mockReturnValue(failModel as any);

      await expect(extractModuleContent('some text')).rejects.toThrow('Model unavailable');
      expect(callCount).toBe(3);
    });
  });

  describe('generateMaterial', () => {
    it('returns title and HTML content', async () => {
      const mockResponse = {
        title: 'Bahan Ajar: Persamaan Linear',
        content: '<h2>Pengertian</h2><p>Persamaan linear adalah...</p>',
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateMaterial(
        'Matematika Kelas 7',
        'Materi tentang persamaan linear satu variabel',
        'Persamaan linear'
      );
      expect(result.title).toBe('Bahan Ajar: Persamaan Linear');
      expect(result.content).toContain('<h2>');
    });

    it('works without optional topic parameter', async () => {
      const mockResponse = { title: 'Bahan Ajar Lengkap', content: '<p>Konten lengkap...</p>' };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateMaterial('Modul Fisika', 'Teks fisika...');
      expect(result.title).toBeTruthy();
      expect(result.content).toBeTruthy();
    });
  });

  describe('generateBlueprint', () => {
    it('returns blueprint with indicators', async () => {
      const mockResponse = {
        title: 'Kisi-kisi Asesmen Persamaan Linear',
        indicators: [
          { id: 'IND-001', description: 'Siswa dapat menyebutkan definisi', bloomLevel: 'C1', competency: 'Pengetahuan' },
          { id: 'IND-002', description: 'Siswa dapat menjelaskan konsep', bloomLevel: 'C2', competency: 'Pemahaman' },
        ],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateBlueprint('Bahan Ajar Persamaan Linear', '<h2>X</h2>', 'merdeka');
      expect(result.indicators).toHaveLength(2);
      expect(result.indicators[0].id).toBe('IND-001');
      expect(result.indicators[0].bloomLevel).toBe('C1');
    });
  });

  describe('generateAssessment', () => {
    it('returns assessment items with 4 options each', async () => {
      const mockResponse = {
        items: [
          {
            question: 'Apa yang dimaksud dengan persamaan linear?',
            options: [
              { id: 'A', text: 'Persamaan dengan pangkat dua' },
              { id: 'B', text: 'Persamaan dengan satu variabel berpangkat satu' },
              { id: 'C', text: 'Persamaan dengan dua variabel' },
              { id: 'D', text: 'Persamaan eksponensial' },
            ],
            correctAnswer: 'B',
            bloomLevel: 'C1',
            indicator: 'IND-001',
          },
        ],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const indicators = [
        { id: 'IND-001', description: 'desc', bloomLevel: 'C1', competency: 'Pengetahuan' },
      ];
      const result = await generateAssessment('Kisi-kisi Persamaan Linear', indicators, 1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].options).toHaveLength(4);
      expect(result.items[0].correctAnswer).toBe('B');
    });

    it('defaults to 10 items when itemCount not provided', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        question: `Soal ${i + 1}`,
        options: [
          { id: 'A', text: 'Opsi A' },
          { id: 'B', text: 'Opsi B' },
          { id: 'C', text: 'Opsi C' },
          { id: 'D', text: 'Opsi D' },
        ],
        correctAnswer: 'A',
        bloomLevel: 'C2',
        indicator: 'IND-001',
      }));
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel({ items }) as any);

      const result = await generateAssessment('Kisi-kisi', [
        { id: 'IND-001', description: 'desc', bloomLevel: 'C2', competency: 'comp' },
      ]);
      expect(result.items).toHaveLength(10);
    });
  });
});
```
Expected: `pnpm --filter @arago/ai test` passes; zero real API calls.

- [ ] **Step 1.10: Run tests**
```bash
pnpm --filter @arago/ai test
```
Expected: All AI tests pass.

- [ ] **Step 1.11: Commit**
```bash
git add packages/ai/src/ "packages/ai/__tests__/ai.test.ts" packages/ai/vitest.config.ts
git commit -m "feat(ai): provider factory, schemas, extract/material/blueprint/assessment generators with mocked tests (KAR-6)"
```

---

### Task 2: Modul Ajar (Upload + Extract + CRUD)

**Files:**
- Create: `apps/web/src/lib/extract-text.ts`
- Test: `apps/web/src/lib/__tests__/extract-text.test.ts`
- Create: `apps/web/src/app/api/upload/module/route.ts`
- Create: `apps/web/src/app/api/ai/extract-module/route.ts`
- Create: `apps/web/src/app/api/modules/route.ts`
- Create: `apps/web/src/app/api/modules/[id]/route.ts`
- Create: `apps/web/src/app/(app)/modules/page.tsx`
- Create: `apps/web/src/app/(app)/modules/new/page.tsx`
- Create: `apps/web/src/app/(app)/modules/[id]/page.tsx`

- [ ] **Step 2.1: Text extraction helper** — `apps/web/src/lib/extract-text.ts`
```typescript
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export function isSupportedMimeType(mime: string): mime is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const data = await pdf(buffer);
    return data.text;
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`);
}
```
Expected: Returns extracted plain text for PDF and DOCX; throws for unsupported types.

- [ ] **Step 2.2: Test for extractText** — `apps/web/src/lib/__tests__/extract-text.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }));

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { extractText } from '../extract-text';

describe('extractText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts text from a PDF buffer', async () => {
    vi.mocked(pdf).mockResolvedValue({ text: 'PDF content here' } as any);
    const buffer = Buffer.from('%PDF-1.4 fake pdf content');
    const result = await extractText(buffer, 'application/pdf');
    expect(result).toBe('PDF content here');
    expect(pdf).toHaveBeenCalledWith(buffer);
  });

  it('extracts text from a DOCX buffer', async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: 'DOCX content here', messages: [] });
    const buffer = Buffer.from('PK fake docx content');
    const result = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(result).toBe('DOCX content here');
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('throws for unsupported MIME types', async () => {
    const buffer = Buffer.from('some content');
    await expect(extractText(buffer, 'image/png')).rejects.toThrow('Unsupported MIME type: image/png');
  });
});
```
Expected: 3 tests pass; pdf-parse and mammoth never make real calls.

- [ ] **Step 2.3: File upload API** — `apps/web/src/app/api/upload/module/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/guards';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 });
  }

  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Only PDF and DOCX files are allowed' },
      { status: 415 }
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = `modules/${workspaceId}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('modules')
    .upload(fileName, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('[upload/module]', uploadError);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from('modules').getPublicUrl(fileName);

  return NextResponse.json({ fileUrl: publicUrlData.publicUrl }, { status: 201 });
}
```
Expected: Returns `{ fileUrl }`; enforces 10 MB cap and PDF/DOCX-only.

- [ ] **Step 2.4: AI extract-module API** — `apps/web/src/app/api/ai/extract-module/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
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
  const mimeType = contentType.split(';')[0].trim();
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { moduleId } = parsed.data;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.id, moduleId), isNull(teachingModules.deletedAt)))
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
    .where(eq(teachingModules.id, moduleId));

  return NextResponse.json({ summary: extracted.summary, topics: extracted.topics });
}
```
Expected: Downloads stored file, extracts text, calls AI, persists `extractedText`, returns `{ summary, topics }`.

- [ ] **Step 2.5: Modules list + create API** — `apps/web/src/app/api/modules/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
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

  return NextResponse.json({ module: newModule }, { status: 201 });
}
```
Expected: GET returns workspace-scoped list; POST creates a draft module.

- [ ] **Step 2.6: Module detail API** — `apps/web/src/app/api/modules/[id]/route.ts`

> PATCH schema includes `fileUrl` because the new-module flow attaches it after upload.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guards';
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

  const { id } = await ctx.params;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.id, id), isNull(teachingModules.deletedAt)))
    .limit(1);

  if (!module_) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ module: module_ });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(teachingModules)
    .set(parsed.data)
    .where(and(eq(teachingModules.id, id), isNull(teachingModules.deletedAt)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ module: updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await ctx.params;

  const [deleted] = await db
    .update(teachingModules)
    .set({ deletedAt: new Date() })
    .where(and(eq(teachingModules.id, id), isNull(teachingModules.deletedAt)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
```
Expected: GET by ID; PATCH updates title/status/fileUrl; DELETE soft-deletes.

- [ ] **Step 2.7: Modules list page** — `apps/web/src/app/(app)/modules/page.tsx`
```tsx
import Link from 'next/link';
import { db } from '@arago/db/client';
import { teachingModules } from '@arago/db/schema';
import { eq, isNull, and, desc } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { redirect } from 'next/navigation';

export default async function ModulesPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  const modules = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
    .orderBy(desc(teachingModules.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Modul Ajar</h1>
        <Link
          href="/modules/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Modul Baru
        </Link>
      </div>

      {modules.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-gray-500">Belum ada modul ajar.</p>
          <Link href="/modules/new" className="mt-2 inline-block text-indigo-600 hover:underline">
            Buat modul pertama Anda
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {modules.map((mod) => (
            <li key={mod.id}>
              <Link
                href={`/modules/${mod.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{mod.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(mod.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    mod.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {mod.status === 'published' ? 'Diterbitkan' : 'Draf'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```
Expected: Lists non-deleted modules for the current workspace; empty state when none.

- [ ] **Step 2.8: New module form page** — `apps/web/src/app/(app)/modules/new/page.tsx`
```tsx
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function NewModulePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Judul modul tidak boleh kosong.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      setStatus('Membuat modul...');
      const createRes = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!createRes.ok) throw new Error('Gagal membuat modul.');
      const { module: createdModule } = await createRes.json();

      if (file) {
        setStatus('Mengunggah berkas...');
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await fetch('/api/upload/module', { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Gagal mengunggah berkas.');
        const { fileUrl } = await uploadRes.json();

        await fetch(`/api/modules/${createdModule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileUrl }),
        });

        setStatus('Menganalisis konten dengan AI...');
        const extractRes = await fetch('/api/ai/extract-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId: createdModule.id }),
        });
        if (!extractRes.ok) {
          console.warn('AI extraction failed, continuing...');
        }
      }

      router.push(`/modules/${createdModule.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Modul Baru</h1>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Judul Modul <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Matematika Kelas 7 — Persamaan Linear"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="file" className="block text-sm font-medium text-gray-700">
            Berkas Modul <span className="text-gray-400 font-normal">(opsional, PDF/DOCX, maks. 10 MB)</span>
          </label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {status && <p className="text-sm text-indigo-600">{status}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Simpan Modul'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
```
Expected: Sequentially creates module → uploads file → PATCHes fileUrl → triggers AI extraction (non-fatal); redirects to module detail.

- [ ] **Step 2.9: Module detail page** — `apps/web/src/app/(app)/modules/[id]/page.tsx`
```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@arago/db/client';
import { teachingModules, teachingMaterials } from '@arago/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

export default async function ModuleDetailPage({ params }: Props) {
  const { id } = await params;

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.id, id), isNull(teachingModules.deletedAt)))
    .limit(1);

  if (!module_) notFound();

  const materials = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.moduleId, id), isNull(teachingMaterials.deletedAt)));

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/modules" className="text-sm text-indigo-600 hover:underline">
            Modul Ajar
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{module_.title}</h1>
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              module_.status === 'published'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {module_.status === 'published' ? 'Diterbitkan' : 'Draf'}
          </span>
        </div>
      </div>

      {module_.extractedText ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-800">Ringkasan Konten</h2>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-6">
            {module_.extractedText.slice(0, 600)}
            {module_.extractedText.length > 600 ? '...' : ''}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center">
          <p className="text-sm text-gray-500">
            Belum ada konten yang diekstrak. Unggah berkas dan analisis dengan AI.
          </p>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Bahan Ajar</h2>
        </div>

        {materials.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center">
            <p className="text-sm text-gray-500">Belum ada bahan ajar untuk modul ini.</p>
            <p className="mt-1 text-xs text-gray-400">
              Generate bahan ajar dari halaman ini (tersedia di Slice 4).
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {materials.map((mat) => (
              <li key={mat.id}>
                <Link
                  href={`/modules/${id}/materials/${mat.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900">{mat.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      mat.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {mat.status === 'published' ? 'Diterbitkan' : 'Draf'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```
Expected: Module title, status, extracted-text preview, and linked teaching materials (the generate-material action arrives in Slice 4).

- [ ] **Step 2.10: Run tests**
```bash
pnpm --filter @arago/web test
```
Expected: extract-text tests pass alongside Slice 2 tests.

- [ ] **Step 2.11: Commit**
```bash
git add apps/web/src/lib/extract-text.ts \
        "apps/web/src/lib/__tests__/extract-text.test.ts" \
        apps/web/src/app/api/upload/module/route.ts \
        apps/web/src/app/api/ai/extract-module/route.ts \
        apps/web/src/app/api/modules/route.ts \
        "apps/web/src/app/api/modules/[id]/route.ts" \
        "apps/web/src/app/(app)/modules/page.tsx" \
        "apps/web/src/app/(app)/modules/new/page.tsx" \
        "apps/web/src/app/(app)/modules/[id]/page.tsx"
git commit -m "feat(web): Modul Ajar — upload, AI extraction, CRUD API, and UI pages (KAR-8)"
```

---

## Slice 3 Done — Definition of Done

- `pnpm --filter @arago/ai test` and `pnpm --filter @arago/web test` pass
- Manual smoke: create module with a PDF → AI summary/topics returned → `extractedText` persisted → preview shows on detail page

**Next:** Slice 4 — Bahan Ajar & Kisi-kisi (`2026-06-16-arago-phase1-slice4-bahan-kisi.md`).
