# Phase 2 Slice 6 — Guru AI Chat Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI chat sidebar to the bahan ajar editor — free-form refinement streamed over SSE, grounded in the current material, with an Apply-to-editor button and quick-suggestion chips.

**Architecture:** A pure system-prompt builder + a thin `streamText` wrapper in `@arago/ai`. A workspace-scoped `POST /api/ai/chat` route re-fetches the material server-side (never trusts client content) and streams. A `MaterialChat` client component uses `@ai-sdk/react` `useChat`; when the assistant returns a revised material inside a single ```html fenced block, the UI shows an Apply button that replaces the Tiptap content.

**Tech Stack:** Vercel AI SDK v4 (`streamText`, `toDataStreamResponse`), `@ai-sdk/react` `useChat`, Next 15 route handlers, Drizzle, Vitest + `MockLanguageModelV1`.

**Security invariants (carried from Phase 1):** every by-id query workspace-scopes; never trust client-supplied material content; exclude soft-deleted. Body carries only `materialId`; the route fetches the content.

---

## File Structure

- Create `packages/ai/src/chat.ts` — `buildMaterialChatSystemPrompt(materialContent)` (pure) + `streamMaterialChat({ materialContent, messages })` (thin `streamText` wrapper).
- Modify `packages/ai/src/index.ts` — export both.
- Modify `packages/ai/__tests__/ai.test.ts` — unit tests for the pure builder.
- Create `apps/web/src/app/api/ai/chat/route.ts` — `POST`, workspace-scoped, returns SSE.
- Create `apps/web/src/components/material-chat.tsx` — chat panel client component.
- Modify `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx` — mount `MaterialChat`, wire Apply → `setContent` + save.
- Modify `apps/web/package.json` — add `@ai-sdk/react`.

---

## Task 1: Pure system-prompt builder in `@arago/ai`

**Files:**
- Create: `packages/ai/src/chat.ts`
- Test: `packages/ai/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/ai/__tests__/ai.test.ts` (new `describe` block, after the existing ones, inside the top-level `describe('@arago/ai', ...)`):

```ts
import { buildMaterialChatSystemPrompt } from '../src/chat.js';

describe('buildMaterialChatSystemPrompt', () => {
  it('embeds the material content and the apply-fence instruction', () => {
    const prompt = buildMaterialChatSystemPrompt('<h2>Sel Tumbuhan</h2><p>Dinding sel...</p>');
    expect(prompt).toContain('<h2>Sel Tumbuhan</h2>');
    expect(prompt).toContain('```html');
    expect(prompt.toLowerCase()).toContain('bahasa indonesia');
  });

  it('handles empty material content without throwing', () => {
    expect(() => buildMaterialChatSystemPrompt('')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arago/ai test -- -t buildMaterialChatSystemPrompt`
Expected: FAIL — `buildMaterialChatSystemPrompt` not exported / module `../src/chat.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai/src/chat.ts`:

```ts
import { streamText, type CoreMessage } from 'ai';
import { getModel } from './providers/index.js';

export function buildMaterialChatSystemPrompt(materialContent: string): string {
  return `Anda adalah asisten penulis perangkat ajar K-12 Indonesia.
Anda membantu guru menyempurnakan sebuah bahan ajar: menambah bagian, mengubah, menyederhanakan bahasa, atau menyesuaikan dengan kurikulum.
Selalu balas dalam Bahasa Indonesia yang jelas.

Aturan untuk menyunting konten:
- Jika guru meminta perubahan pada isi bahan ajar, tulis ULANG seluruh bahan ajar (versi lengkap yang sudah diperbarui) di dalam SATU blok berpagar \`\`\`html ... \`\`\`.
- Konten di dalam blok harus HTML yang valid untuk editor (gunakan <h2>, <p>, <ul>, <li>, <strong>).
- Di luar blok, beri penjelasan singkat tentang apa yang Anda ubah.
- Jika guru hanya bertanya/berdiskusi (tanpa minta perubahan), jawab biasa TANPA blok \`\`\`html.

Bahan ajar saat ini:
"""
${materialContent}
"""`;
}

export function streamMaterialChat(opts: {
  materialContent: string;
  messages: CoreMessage[];
}) {
  return streamText({
    model: getModel(),
    system: buildMaterialChatSystemPrompt(opts.materialContent),
    messages: opts.messages,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arago/ai test -- -t buildMaterialChatSystemPrompt`
Expected: PASS (2 tests).

- [ ] **Step 5: Export from package index**

Modify `packages/ai/src/index.ts` — add after the `generateAssessment` export line:

```ts
export { buildMaterialChatSystemPrompt, streamMaterialChat } from './chat.js';
```

- [ ] **Step 6: Typecheck + full test**

Run: `pnpm --filter @arago/ai typecheck && pnpm --filter @arago/ai test`
Expected: PASS (existing 13 + 2 new = 15).

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/chat.ts packages/ai/src/index.ts packages/ai/__tests__/ai.test.ts
git commit -m "feat(ai): material chat system-prompt builder + streamMaterialChat"
```

---

## Task 2: `POST /api/ai/chat` route (workspace-scoped SSE)

**Files:**
- Create: `apps/web/src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Write the route**

The route mirrors `generate-blueprint/route.ts` scoping exactly (material → module → workspaceId innerJoin, exclude soft-deleted), then streams. `useChat` posts `{ messages, materialId }`.

Create `apps/web/src/app/api/ai/chat/route.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { streamMaterialChat } from '@arago/ai'
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
  const { error: authError, session } = await requireAuth()
  if (authError || !session) return authError!

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, messages } = parsed.data

  // Re-fetch material server-side and workspace-scope it. Never trust client content.
  const [material] = await db
    .select({ content: teachingMaterials.content })
    .from(teachingMaterials)
    .innerJoin(teachingModules, eq(teachingMaterials.moduleId, teachingModules.id))
    .where(
      and(
        eq(teachingMaterials.id, materialId),
        eq(teachingModules.workspaceId, workspaceId),
        isNull(teachingMaterials.deletedAt),
      ),
    )
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  const result = streamMaterialChat({
    materialContent: material.content ?? '',
    messages,
  })

  return result.toDataStreamResponse()
}
```

- [ ] **Step 2: Typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS. (If `toDataStreamResponse` is missing on the type, confirm AI SDK v4 — it exists on the `streamText` result.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/ai/chat/route.ts
git commit -m "feat(web): POST /api/ai/chat — workspace-scoped streaming material chat"
```

---

## Task 3: Add `@ai-sdk/react` dependency

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dependency**

Add to `apps/web/package.json` `dependencies` (alphabetical, after `"ai"`):

```json
"@ai-sdk/react": "^1.1.0",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, `@ai-sdk/react` resolved. (Version must be compatible with `ai@^4.1.0`; if pnpm reports a peer mismatch, align the minor to the installed `ai` version.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @ai-sdk/react for chat streaming"
```

---

## Task 4: `MaterialChat` client component

**Files:**
- Create: `apps/web/src/components/material-chat.tsx`

- [ ] **Step 1: Write the component**

`useChat` streams assistant text. A helper extracts the last ```html block (the revised material) so the parent can Apply it. Quick-suggestion chips prefill+send.

Create `apps/web/src/components/material-chat.tsx`:

```tsx
'use client'

import { useChat } from '@ai-sdk/react'

const CHIPS = [
  'Sederhanakan bahasa untuk kelas 7',
  'Tambah contoh konkret',
  'Buat ringkasan di akhir',
  'Sesuaikan dengan CP Fase E Kurikulum Merdeka',
]

// Extracts the last ```html ... ``` block from an assistant message, if present.
export function extractRevisedHtml(text: string): string | null {
  const matches = [...text.matchAll(/```html\s*([\s\S]*?)```/g)]
  const last = matches[matches.length - 1]
  return last ? last[1].trim() : null
}

interface MaterialChatProps {
  materialId: string
  onApply: (html: string) => void
}

export function MaterialChat({ materialId, onApply }: MaterialChatProps) {
  const { messages, input, handleInputChange, handleSubmit, append, status } = useChat({
    api: '/api/ai/chat',
    body: { materialId },
  })

  const busy = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex flex-col h-full border border-neutral-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Asisten AI
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">
            Minta bantuan menyempurnakan bahan ajar ini.
          </p>
        )}
        {messages.map((m) => {
          const revised = m.role === 'assistant' ? extractRevisedHtml(m.content) : null
          return (
            <div key={m.id} className="text-sm">
              <div className={m.role === 'user' ? 'font-medium text-neutral-900' : 'text-neutral-700'}>
                {m.role === 'user' ? 'Anda' : 'AI'}
              </div>
              <div className="whitespace-pre-wrap text-neutral-700">{m.content}</div>
              {revised && (
                <button
                  type="button"
                  onClick={() => onApply(revised)}
                  className="mt-1 px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Terapkan ke editor
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="p-2 border-t border-neutral-200 space-y-2">
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => append({ role: 'user', content: c })}
              className="px-2 py-1 rounded-full text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-600 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            disabled={busy}
            placeholder="Tulis perintah..."
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
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS. (If `useChat` `status` field name differs in the installed `@ai-sdk/react`, use the documented field — older minors expose `isLoading: boolean`; set `const busy = isLoading` instead.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/material-chat.tsx
git commit -m "feat(web): MaterialChat component — streaming chat, chips, apply-to-editor"
```

---

## Task 5: Mount chat in the material editor + wire Apply

**Files:**
- Modify: `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx`

- [ ] **Step 1: Import the component**

Add to the imports at the top of the file (after the `RichTextEditor` import):

```tsx
import { MaterialChat } from '@/components/material-chat'
```

- [ ] **Step 2: Add an apply handler**

Add this handler inside the component, right after `handleContentChange`:

```tsx
const handleApplyRevision = useCallback(
  (html: string) => {
    setContent(html)
    save({ content: html })
  },
  [save],
)
```

- [ ] **Step 3: Render the chat in the right column**

In the JSX, the editor sits in `<div className="flex gap-8">` with a left `flex-1` column and a right `w-56` column. Widen the right column and add the chat above the existing sticky controls. Replace the opening of the right column:

Find:
```tsx
        <div className="w-56 shrink-0">
          <div className="sticky top-8 space-y-4">
```
Replace with:
```tsx
        <div className="w-80 shrink-0">
          <div className="sticky top-8 space-y-4">
            <div className="h-[420px]">
              <MaterialChat materialId={material.id} onApply={handleApplyRevision} />
            </div>
```

(The extra opening `<div>` is closed by the existing closing tags of the sticky container — verify brace/tag balance after editing; the sticky `space-y-4` container already wraps the controls, so the new `h-[420px]` div becomes its first child and needs no extra closing tag beyond what already exists. If tag balance breaks, wrap only the `<MaterialChat>` in the `h-[420px]` div and leave the rest untouched.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: Build (route validation — Phase 1 lesson)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK; route table lists `/api/ai/chat`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx"
git commit -m "feat(web): mount AI chat sidebar in bahan ajar editor with apply-to-editor"
```

---

## Task 6: Unit test the apply-html extractor

**Files:**
- Create: `apps/web/__tests__/material-chat.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/__tests__/material-chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractRevisedHtml } from '@/components/material-chat'

describe('extractRevisedHtml', () => {
  it('returns null when no html block present', () => {
    expect(extractRevisedHtml('Saya sarankan menambah contoh.')).toBeNull()
  })

  it('extracts the html block content', () => {
    const text = 'Sudah saya perbarui:\n```html\n<h2>Sel</h2><p>Isi</p>\n```'
    expect(extractRevisedHtml(text)).toBe('<h2>Sel</h2><p>Isi</p>')
  })

  it('returns the last block when multiple present', () => {
    const text = '```html\n<p>A</p>\n```\nlalu\n```html\n<p>B</p>\n```'
    expect(extractRevisedHtml(text)).toBe('<p>B</p>')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @arago/web test -- -t extractRevisedHtml`
Expected: PASS (3 tests). (Confirm the web vitest config resolves the `@/` alias; existing web tests already use it.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/material-chat.test.ts
git commit -m "test(web): extractRevisedHtml parses apply-to-editor html block"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/ai test` passes (15 tests).
- [ ] `pnpm --filter @arago/web test` passes (existing 23 + 3 new = 26).
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds; `/api/ai/chat` in the route table.
- [ ] Manual (real env): open a bahan ajar, ask "sederhanakan bahasa" → streamed reply; ask "tambah bagian X" → ```html block + Apply replaces editor content and auto-saves.

## Self-review notes
- Spec coverage: chat sidebar ✓ (Task 4–5), suggestion chips ✓ (Task 4 CHIPS), apply human-in-loop ✓ (Task 5), streaming SSE ✓ (Task 2), workspace-scope no-trust ✓ (Task 2).
- The route only accepts `materialId` + `messages`; content is server-fetched — no client-content trust.
- `useChat` API surface (`status` vs `isLoading`) is the one uncertainty — Task 4 Step 2 gives the fallback.
