# Arago Phase 2 — AI Chat — Design

**Date:** 2026-06-16
**Status:** Approved
**Parent spec:** `2026-06-16-arago-platform-design.md` §10 Fase 2
**Builds on:** Phase 1 MVP (PRs #1–#5, merged to `master`)

---

## Scope

Phase 2 = **AI Chat** layer over the Phase 1 content chain:

- AI chat sidebar in the bahan ajar editor (guru) — free-form refinement with **Apply to editor** button.
- Quick-suggestion chips (the "AI suggestion inline" item — implemented as preset prompt chips, not ghost-text).
- AI tutor for students (RAG) — answers strictly from the published bahan ajar being read.
- Curriculum templates — **Kurikulum Merdeka** & **K-13** presets driving kisi-kisi generation.

Out of scope (later phases): Kelas/classes (Phase 3), shortcut jump-ahead, export PDF, analytics (Phase 4), vector/pgvector RAG.

---

## Decomposition — 3 slices

Same flow as Phase 1: one PR per slice, haiku implements / sonnet reviews, `next build` validates routing before "done".

| Slice | Title | Delivers |
|---|---|---|
| 6 | Guru AI Chat sidebar | `/api/ai/chat` SSE stream, chat UI in bahan ajar editor, suggestion chips, Apply-to-editor |
| 7 | Curriculum templates | Kurikulum Merdeka & K-13 presets for `generate-blueprint` + `curriculumType` picker |
| 8 | Student read + AI tutor | `/student/materials/[id]` read page + `/api/ai/tutor` RAG SSE constrained to that material |

Slices are independent and independently shippable. 7 has no dependency on 6; 8 depends only on Phase 1 (published materials).

---

## Slice 6 — Guru AI Chat sidebar

**Goal:** Split-view bahan ajar editor — Tiptap (left) + AI chat (right).

### AI package (`@arago/ai`)
- `chat.ts` — `streamMaterialChat({ materialContent, messages })` → returns a streaming text result (Vercel AI SDK `streamText`).
- System prompt frames the model as an Indonesian curriculum writing assistant; injects the **current material content** as context so refinements ("tambah bagian sel tumbuhan", "sederhanakan untuk kelas 7") are grounded.
- Provider: existing `getModel()` (Anthropic default). Reuse, do not duplicate.

### Apply-to-editor
- Free-form turns stream as chat text.
- When the guru asks for a content rewrite, the response includes a **revised full material** in a fenced block (or a dedicated "revise" path returns `{ reply, revisedContent? }`). UI shows an **Apply** button when `revisedContent` is present; clicking replaces the Tiptap content (guru reviews first — `AI content wajib review guru` invariant). No auto-apply.

### API route — `POST /api/ai/chat`
- Auth: session + active-workspace cookie.
- **Security (🔒):** body carries `materialId`; route **re-fetches** the material server-side and **workspace-scopes** it (material → module → `workspaceId` innerJoin, exclude soft-deleted). Never trust client-supplied material content. The fetched content is what gets sent to the model.
- Returns SSE stream (`toDataStreamResponse()` / `toTextStreamResponse()`).

### UI
- `MaterialChat` client component beside the editor: message list, input, streaming via `useChat` (or `useCompletion`), quick-suggestion chips above input (`sederhanakan bahasa`, `tambah contoh`, `buat ringkasan`, `sesuaikan CP Fase E`).
- Chips just prefill/send the input.

### Tests
- `chat.ts` unit with `MockLanguageModelV1` (`ai/test`) — asserts material content lands in the prompt.
- Route: workspace-scope rejects cross-workspace `materialId` (mirror existing route tests).

---

## Slice 7 — Curriculum templates

**Goal:** Kisi-kisi generation aware of curriculum framework.

### Validators (`@arago/validators`)
- `curriculumType` enum already exists (`merdeka` | `k13` | `custom` — confirm against schema; align if names differ).

### AI package
- `generate-blueprint.ts` — extend the prompt with a curriculum-template block:
  - **Kurikulum Merdeka:** Capaian Pembelajaran (CP) per Fase (A–F), Tujuan Pembelajaran, Profil Pelajar Pancasila framing.
  - **K-13:** Kompetensi Inti (KI) / Kompetensi Dasar (KD), indikator pencapaian.
  - **custom:** current free-form behavior (unchanged default).
- Template text lives in `@arago/ai` (`templates/curriculum.ts`) — pure constants, unit-testable.

### UI
- Blueprint create / generate form: `curriculumType` select (Merdeka / K-13 / Custom). Pass through to `/api/ai/generate-blueprint`.
- Persist `curriculumType` on the blueprint (column already in schema).

### Security (🔒)
- Generation route already workspace-scopes the source material (material → module). Curriculum type is a non-privileged enum — validate it against the enum, no trust issue.

### Tests
- `generate-blueprint` unit: each curriculum type injects its template markers into the prompt (Mock model).
- Validator: rejects unknown `curriculumType`.

---

## Slice 8 — Student read bahan ajar + AI tutor (RAG)

**Goal:** Students read a published material and ask a context-bound tutor.

### Read page — `/student/materials/[id]`
- Server component renders published material content (read-only Tiptap render or sanitized HTML).
- **Security (🔒):** scope by **`workspaceMembers` membership** (student is a member of the material's workspace), NOT the teacher active-workspace cookie. Only `status = 'published'`, not soft-deleted. 404 otherwise.

### AI tutor — `POST /api/ai/tutor`
- Auth: session + membership check (same scoping as the read page).
- **RAG = full-text-in-context (no vectors):** server re-fetches the published material, stuffs its full `content` into the system prompt.
- System prompt **hard-constrains**: answer ONLY from the provided material; if asked outside it (incl. "what's the answer to assessment question X"), refuse politely in Indonesian. This is the spec's "tidak menjawab di luar materi — mencegah jawaban soal asesmen" guard.
- SSE stream like `/api/ai/chat`.

### UI
- `TutorChat` client component on the read page (collapsible panel): message list + input, streaming. No Apply button (read-only context).

### Tests
- `tutor.ts` unit: material content in prompt; system prompt contains the refusal/constraint instruction (Mock model).
- Route: non-member student rejected; unpublished/soft-deleted material 404.
- Read page scoping mirrors existing student submission scoping tests.

---

## Cross-cutting

- **Streaming infra:** Vercel AI SDK `streamText` server-side + `@ai-sdk/react` `useChat`/`useCompletion` client-side. Add `@ai-sdk/react` if not present. Confirm AI SDK v4 streaming API.
- **Security invariants (carried from Phase 1):** every by-id query workspace-scopes; student routes scope by membership not cookie; never trust client content/scores; exclude soft-deleted.
- **Build gate:** `next build` (not just typecheck/vitest) before any slice with new routes is "done" — Phase 1 lesson.
- **Error handling (spec §11):** AI endpoint failure → actionable error to user, retry. Streaming errors surface in the chat panel.

---

## Routes added

```
Slice 6:  POST /api/ai/chat
Slice 7:  (extends POST /api/ai/generate-blueprint — no new route)
Slice 8:  /student/materials/[id]   (page)
          POST /api/ai/tutor
```

## Packages touched

```
@arago/ai          chat.ts, tutor.ts, templates/curriculum.ts, generate-blueprint.ts (extend)
@arago/validators  curriculumType enum (confirm/align)
apps/web           MaterialChat, TutorChat, chips, blueprint curriculum picker, student read page, 2 API routes
```
