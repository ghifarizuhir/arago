# Phase 2 Slice 8 — Student Read + AI Tutor (RAG) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students read a published bahan ajar and ask a context-bound AI tutor that answers ONLY from that material (refusing off-material questions, including assessment answers).

**Architecture:** RAG = full-text-in-context (no vectors). Membership-scoped API routes (`GET /api/student/materials`, `GET /api/student/materials/[id]`, `POST /api/ai/tutor`) re-fetch the published material server-side. A client read page renders the content read-only (Tiptap `editable={false}`) with a `TutorChat` panel using `@ai-sdk/react` `useChat`. The student dashboard lists published materials so the page is reachable.

**Tech Stack:** Vercel AI SDK v4 `streamText`, `@ai-sdk/react` `useChat` (added in Slice 6 — if executing 8 before 6, add `@ai-sdk/react` to `apps/web/package.json` first), Drizzle, Vitest + `MockLanguageModelV1`.

**Security invariants (CRITICAL — student routes):** scope by **`workspaceMembers` membership**, NOT the teacher active-workspace cookie. Only `status = 'published'`, exclude soft-deleted. Tutor refuses anything outside the material. Body carries only `materialId` — content is server-fetched, never trusted from the client.

---

## File Structure

- Create `packages/ai/src/tutor.ts` — `buildTutorSystemPrompt(materialContent)` (pure) + `streamTutor({ materialContent, messages })` (thin wrapper).
- Modify `packages/ai/src/index.ts` — export both.
- Modify `packages/ai/__tests__/ai.test.ts` — test the pure builder (content + refusal constraint).
- Create `apps/web/src/app/api/student/materials/route.ts` — `GET` list (membership-scoped, published).
- Create `apps/web/src/app/api/student/materials/[id]/route.ts` — `GET` one (membership-scoped, published).
- Create `apps/web/src/app/api/ai/tutor/route.ts` — `POST` SSE (membership-scoped).
- Create `apps/web/src/components/tutor-chat.tsx` — read-side tutor panel.
- Create `apps/web/src/app/(student)/student/materials/[id]/page.tsx` — read page.
- Modify `apps/web/src/app/(student)/student/page.tsx` — list published materials with links.

---

## Task 1: Tutor prompt builder + stream wrapper

**Files:**
- Create: `packages/ai/src/tutor.ts`
- Test: `packages/ai/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/ai/__tests__/ai.test.ts`:

```ts
import { buildTutorSystemPrompt } from '../src/tutor.js';

describe('buildTutorSystemPrompt', () => {
  it('embeds the material content', () => {
    const p = buildTutorSystemPrompt('<p>Fotosintesis terjadi di kloroplas.</p>');
    expect(p).toContain('Fotosintesis terjadi di kloroplas.');
  });

  it('instructs to answer only from the material and refuse outside it', () => {
    const p = buildTutorSystemPrompt('<p>x</p>').toLowerCase();
    expect(p).toContain('hanya');
    expect(p).toContain('materi');
    // must guard against leaking assessment answers
    expect(p).toContain('soal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arago/ai test -- -t buildTutorSystemPrompt`
Expected: FAIL — module `../src/tutor.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai/src/tutor.ts`:

```ts
import { streamText, type CoreMessage } from 'ai';
import { getModel } from './providers/index.js';

export function buildTutorSystemPrompt(materialContent: string): string {
  return `Anda adalah tutor AI yang mendampingi murid membaca sebuah bahan ajar.
Jawab HANYA berdasarkan isi materi di bawah ini. Selalu gunakan Bahasa Indonesia yang ramah dan sesuai untuk murid.

Aturan ketat:
- Jika pertanyaan tidak dapat dijawab dari materi, katakan dengan sopan bahwa hal itu di luar materi dan arahkan murid kembali ke bahan ajar.
- JANGAN memberi jawaban soal asesmen/ujian atau mengerjakan tugas untuk murid. Jika diminta jawaban soal, tolak dan ajak murid memahami konsepnya.
- Jangan mengarang fakta di luar materi.

Isi bahan ajar:
"""
${materialContent}
"""`;
}

export function streamTutor(opts: {
  materialContent: string;
  messages: CoreMessage[];
}) {
  return streamText({
    model: getModel(),
    system: buildTutorSystemPrompt(opts.materialContent),
    messages: opts.messages,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arago/ai test -- -t buildTutorSystemPrompt`
Expected: PASS (2 tests).

- [ ] **Step 5: Export from index**

Modify `packages/ai/src/index.ts` — add:

```ts
export { buildTutorSystemPrompt, streamTutor } from './tutor.js';
```

- [ ] **Step 6: Typecheck + full test**

Run: `pnpm --filter @arago/ai typecheck && pnpm --filter @arago/ai test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/tutor.ts packages/ai/src/index.ts packages/ai/__tests__/ai.test.ts
git commit -m "feat(ai): tutor prompt builder (material-only, refuses off-material + assessment answers)"
```

---

## Task 2: Student materials list + detail routes (membership-scoped)

**Files:**
- Create: `apps/web/src/app/api/student/materials/route.ts`
- Create: `apps/web/src/app/api/student/materials/[id]/route.ts`

- [ ] **Step 1: Write the list route**

Membership join: a material is visible if the student is a member of the material's workspace (material → module → workspaceId → workspaceMembers), published, not soft-deleted.

Create `apps/web/src/app/api/student/materials/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const rows = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      moduleId: teachingMaterials.moduleId,
    })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, teachingModules.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, session.user.id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
      ),
    )

  return NextResponse.json({ materials: rows })
}
```

- [ ] **Step 2: Write the detail route**

Create `apps/web/src/app/api/student/materials/[id]/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const [material] = await db
    .select({
      id: teachingMaterials.id,
      title: teachingMaterials.title,
      content: teachingMaterials.content,
    })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, teachingModules.workspaceId))
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(workspaceMembers.userId, session.user.id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json({ material })
}
```

(Note: Next 15 dynamic route `params` is a Promise — `await params`. Confirm against an existing `[id]` route's signature; if the repo uses the sync form, match it.)

- [ ] **Step 3: Typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/student/materials/route.ts "apps/web/src/app/api/student/materials/[id]/route.ts"
git commit -m "feat(web): student materials list + detail routes (membership-scoped, published only)"
```

---

## Task 3: `POST /api/ai/tutor` route (membership-scoped SSE)

**Files:**
- Create: `apps/web/src/app/api/ai/tutor/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/web/src/app/api/ai/tutor/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules, workspaceMembers } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { streamTutor } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  materialId: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    }),
  ),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, messages } = parsed.data

  // Membership-scoped re-fetch of the published material. Never trust client content.
  const [material] = await db
    .select({ content: teachingMaterials.content })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, teachingModules.workspaceId))
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(workspaceMembers.userId, session.user.id),
        eq(teachingMaterials.status, 'published'),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const result = streamTutor({ materialContent: material.content ?? '', messages })
  return result.toDataStreamResponse()
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/ai/tutor/route.ts
git commit -m "feat(web): POST /api/ai/tutor — membership-scoped RAG tutor stream"
```

---

## Task 4: `TutorChat` component

**Files:**
- Create: `apps/web/src/components/tutor-chat.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/tutor-chat.tsx`:

```tsx
'use client'

import { useChat } from '@ai-sdk/react'

interface TutorChatProps {
  materialId: string
}

export function TutorChat({ materialId }: TutorChatProps) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/ai/tutor',
    body: { materialId },
  })

  const busy = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex flex-col h-full border border-neutral-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Tutor AI
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">Tanya apa saja tentang materi ini.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <div className={m.role === 'user' ? 'font-medium text-neutral-900' : 'text-neutral-700'}>
              {m.role === 'user' ? 'Kamu' : 'Tutor'}
            </div>
            <div className="whitespace-pre-wrap text-neutral-700">{m.content}</div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="p-2 border-t border-neutral-200 flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          disabled={busy}
          placeholder="Tanya tutor..."
          className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-900 hover:bg-neutral-700 text-white disabled:opacity-50"
        >
          Kirim
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS. (Same `useChat` `status` vs `isLoading` caveat as Slice 6 — use the field the installed `@ai-sdk/react` exposes.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/tutor-chat.tsx
git commit -m "feat(web): TutorChat component (streaming, read-side)"
```

---

## Task 5: Student read page

**Files:**
- Create: `apps/web/src/app/(student)/student/materials/[id]/page.tsx`

- [ ] **Step 1: Write the page**

Client page (matches the existing student-page pattern): fetch the material via the membership-scoped detail route, render content read-only with `RichTextEditor editable={false}`, mount `TutorChat`.

Create `apps/web/src/app/(student)/student/materials/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { RichTextEditor } from '@/components/editor/rich-text-editor'
import { TutorChat } from '@/components/tutor-chat'

type Material = { id: string; title: string; content: string }

export default function StudentMaterialPage() {
  const { id } = useParams<{ id: string }>()
  const [material, setMaterial] = useState<Material | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/student/materials/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ material: m }: { material: Material }) => setMaterial(m))
      .catch(() => setMaterial(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat materi...</div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-sm">Materi tidak ditemukan.</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-4">{material.title}</h1>
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          <RichTextEditor content={material.content} onChange={() => {}} editable={false} />
        </div>
        <div className="w-80 shrink-0">
          <div className="sticky top-8 h-[480px]">
            <TutorChat materialId={material.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + build (route validation — Phase 1 lesson)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK; route table lists `/student/materials/[id]`, `/api/ai/tutor`, `/api/student/materials`, `/api/student/materials/[id]`. **Confirm these are NOT written at literal-backslash paths** (the Phase 1 escaped-path bug).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(student)/student/materials/[id]/page.tsx"
git commit -m "feat(web): student read page — published material + AI tutor"
```

---

## Task 6: List published materials on the student dashboard

**Files:**
- Modify: `apps/web/src/app/(student)/student/page.tsx`

- [ ] **Step 1: Read the current dashboard**

Read `apps/web/src/app/(student)/student/page.tsx` to learn its existing fetch + render shape (it lists assessments). Follow the same loading/empty/list pattern; do not restructure unrelated code.

- [ ] **Step 2: Add a published-materials section**

Add a second fetch to `GET /api/student/materials` and render a list where each item links to `/student/materials/${m.id}`. Concretely, add near the existing state/effects:

```tsx
const [materials, setMaterials] = useState<{ id: string; title: string }[]>([])

useEffect(() => {
  fetch('/api/student/materials')
    .then((r) => r.json())
    .then(({ materials: ms }: { materials: { id: string; title: string }[] }) => setMaterials(ms ?? []))
    .catch(() => setMaterials([]))
}, [])
```

And render a section (place above or below the assessments list, matching the page's existing card/list styling):

```tsx
<section className="mb-8">
  <h2 className="text-lg font-semibold text-neutral-900 mb-3">Bahan Ajar</h2>
  {materials.length === 0 ? (
    <p className="text-sm text-neutral-400">Belum ada bahan ajar.</p>
  ) : (
    <ul className="space-y-2">
      {materials.map((m) => (
        <li key={m.id}>
          <a
            href={`/student/materials/${m.id}`}
            className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800"
          >
            {m.title}
          </a>
        </li>
      ))}
    </ul>
  )}
</section>
```

(Adapt class names to the page's existing style. If the dashboard uses `next/link`, use `<Link>` instead of `<a>` to match.)

- [ ] **Step 3: Typecheck + build**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(student)/student/page.tsx"
git commit -m "feat(web): list published bahan ajar on student dashboard"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/ai test` passes (tutor builder tests green).
- [ ] `pnpm --filter @arago/web test` passes.
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds; new routes present and NOT at escaped paths.
- [ ] Manual (real env): as a workspace-member student, open a published material → content renders read-only; ask tutor an on-material question → grounded answer; ask "what's the answer to question 3 of the asesmen" → tutor refuses. As a non-member, `GET /api/student/materials/[id]` returns 404.

## Self-review notes
- Spec coverage (§4 Fitur Murid, §2 AI Tutor): read published material ✓ (Task 5), contextual tutor ✓ (Task 3–4), refuse off-material/assessment answers ✓ (Task 1 prompt + test). RAG = full-text-in-context per approved design.
- Security: ALL three routes membership-scope via `workspaceMembers` (not the teacher cookie), published-only, exclude soft-deleted — mirrors `api/student/submissions/route.ts`. Tutor body carries only `materialId`; content server-fetched.
- `@ai-sdk/react` dependency: added in Slice 6; if 8 runs first, add it (see Tech Stack note) before Task 4.
- Type names consistent: `buildTutorSystemPrompt`, `streamTutor`, `TutorChat`, route shapes mirror existing student routes.
