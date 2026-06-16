# Phase 2 Slice 7 — Curriculum Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make kisi-kisi generation curriculum-aware — Kurikulum Merdeka (CP/Fase, Profil Pelajar Pancasila) and K-13 (KI/KD) presets injected into the generation prompt, with the guru choosing the framework at generation time.

**Architecture:** Pure curriculum-template constants in `@arago/ai` (`templates/curriculum.ts`), injected into the `generateBlueprint` prompt by `curriculumType`. The material editor's "Generate Kisi-kisi" gains a framework `<select>` instead of the hardcoded `'merdeka'`. No new route — the existing `POST /api/ai/generate-blueprint` already validates the `curriculumType` enum and workspace-scopes the source material.

**Tech Stack:** Vercel AI SDK v4 `generateObject` (unchanged), Vitest + `MockLanguageModelV1`, Next 15 client component.

**Security invariants:** `curriculumType` is a non-privileged enum validated by the route's `z.enum(['merdeka','k13','custom'])`; the source material is already workspace-scoped (material → module). No new trust surface.

---

## File Structure

- Create `packages/ai/src/templates/curriculum.ts` — `curriculumTemplate(type)` → guidance string (pure).
- Modify `packages/ai/src/generate-blueprint.ts` — inject the template into the prompt.
- Modify `packages/ai/__tests__/ai.test.ts` — assert each type injects its markers.
- Modify `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx` — framework `<select>` feeding the generate call.

---

## Task 1: Curriculum template constants

**Files:**
- Create: `packages/ai/src/templates/curriculum.ts`
- Test: `packages/ai/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/ai/__tests__/ai.test.ts` (new `describe` inside the top-level block):

```ts
import { curriculumTemplate } from '../src/templates/curriculum.js';

describe('curriculumTemplate', () => {
  it('merdeka mentions Capaian Pembelajaran and Fase', () => {
    const t = curriculumTemplate('merdeka');
    expect(t).toContain('Capaian Pembelajaran');
    expect(t).toContain('Fase');
  });

  it('k13 mentions Kompetensi Inti and Kompetensi Dasar', () => {
    const t = curriculumTemplate('k13');
    expect(t).toContain('Kompetensi Inti');
    expect(t).toContain('Kompetensi Dasar');
  });

  it('custom returns an empty guidance string', () => {
    expect(curriculumTemplate('custom')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arago/ai test -- -t curriculumTemplate`
Expected: FAIL — module `../src/templates/curriculum.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai/src/templates/curriculum.ts`:

```ts
export type CurriculumType = 'merdeka' | 'k13' | 'custom';

const MERDEKA = `Kerangka: Kurikulum Merdeka.
- Petakan indikator ke Capaian Pembelajaran (CP) sesuai Fase (A–F) yang relevan dengan jenjang materi.
- Rumuskan sebagai Tujuan Pembelajaran yang operasional.
- Pertimbangkan dimensi Profil Pelajar Pancasila bila relevan.
- Gunakan istilah "kompetensi" pada field competency yang merujuk pada CP/Tujuan Pembelajaran.`;

const K13 = `Kerangka: Kurikulum 2013 (K-13).
- Petakan indikator ke Kompetensi Inti (KI) dan Kompetensi Dasar (KD) yang relevan.
- Field competency harus merujuk pada KD (mis. "KD 3.x ...").
- Indikator adalah Indikator Pencapaian Kompetensi (IPK) yang menjabarkan KD.`;

export function curriculumTemplate(type: CurriculumType): string {
  if (type === 'merdeka') return MERDEKA;
  if (type === 'k13') return K13;
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arago/ai test -- -t curriculumTemplate`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/templates/curriculum.ts packages/ai/__tests__/ai.test.ts
git commit -m "feat(ai): curriculum template constants (merdeka, k13, custom)"
```

---

## Task 2: Inject template into `generateBlueprint`

**Files:**
- Modify: `packages/ai/src/generate-blueprint.ts`
- Test: `packages/ai/__tests__/ai.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that asserts the prompt passed to the model carries the K-13 marker. Capture the prompt via the mock's `doGenerate`:

```ts
describe('generateBlueprint curriculum injection', () => {
  it('includes the k13 template markers in the model prompt', async () => {
    let capturedPrompt = '';
    const model = new MockLanguageModelV1({
      defaultObjectGenerationMode: 'json',
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return {
          rawCall: { rawPrompt: null, rawSettings: {} },
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1 },
          text: JSON.stringify({
            title: 'Kisi-kisi',
            indicators: [{ id: 'IND-001', description: 'd', bloomLevel: 'C1', competency: 'KD 3.1' }],
          }),
        };
      },
    });
    vi.spyOn(providers, 'getModel').mockReturnValue(model as any);

    await generateBlueprint('Judul', '<p>isi</p>', 'k13');
    expect(capturedPrompt).toContain('Kompetensi Dasar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @arago/ai test -- -t "curriculum injection"`
Expected: FAIL — prompt does not yet contain `Kompetensi Dasar`.

- [ ] **Step 3: Implement injection**

Modify `packages/ai/src/generate-blueprint.ts`. Add the import at the top:

```ts
import { curriculumTemplate, type CurriculumType } from './templates/curriculum.js';
```

In `attempt`, build and inject the guidance. Replace the existing `prompt:` template literal so it includes the template block. The new `attempt` body:

```ts
async function attempt(
  materialTitle: string,
  content: string,
  curriculumType: string
): Promise<GeneratedBlueprint> {
  const guidance = curriculumTemplate(curriculumType as CurriculumType);
  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedBlueprintSchema,
    prompt: `You are an expert Indonesian K-12 assessment designer.
Create an assessment blueprint (Kisi-kisi) for the teaching material below.
Curriculum type: ${curriculumType}
${guidance ? `\n${guidance}\n` : ''}
Generate 5-8 indicators covering a range of Bloom's taxonomy levels (C1 through C6).
Each indicator must have a unique id (e.g. "IND-001"), a clear description of what students can do,
the Bloom level (C1, C2, C3, C4, C5, or C6), and the core competency it maps to.

Material title: ${materialTitle}
Material content:
${content}`,
  });
  return object;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @arago/ai test -- -t "curriculum injection"`
Expected: PASS.

- [ ] **Step 5: Full AI test + typecheck**

Run: `pnpm --filter @arago/ai typecheck && pnpm --filter @arago/ai test`
Expected: PASS (15 from Slice 6 + 4 new = 19; if Slice 6 not yet merged, 13 + 4 = 17).

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/generate-blueprint.ts packages/ai/__tests__/ai.test.ts
git commit -m "feat(ai): inject curriculum template into blueprint generation prompt"
```

---

## Task 3: Curriculum picker at generation time

**Files:**
- Modify: `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx`

- [ ] **Step 1: Add curriculum state**

Add a state hook next to the other `useState` calls in the component (after `genBlueprint`):

```tsx
const [genCurriculum, setGenCurriculum] = useState<'merdeka' | 'k13' | 'custom'>('merdeka')
```

- [ ] **Step 2: Use the chosen type in the generate call**

In `handleGenerateBlueprint`, change the hardcoded body. Find:

```tsx
        body: JSON.stringify({ materialId: material.id, curriculumType: 'merdeka' }),
```
Replace with:
```tsx
        body: JSON.stringify({ materialId: material.id, curriculumType: genCurriculum }),
```

- [ ] **Step 3: Render the select above the generate button**

Find the generate button block:
```tsx
            <button
              type="button"
              onClick={handleGenerateBlueprint}
              disabled={genBlueprint}
```
Insert immediately BEFORE that `<button>`:
```tsx
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                Kurikulum
              </label>
              <select
                value={genCurriculum}
                onChange={(e) => setGenCurriculum(e.target.value as 'merdeka' | 'k13' | 'custom')}
                className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
              >
                <option value="merdeka">Kurikulum Merdeka</option>
                <option value="k13">Kurikulum 2013</option>
                <option value="custom">Custom</option>
              </select>
            </div>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @arago/web typecheck`
Expected: PASS.

- [ ] **Step 5: Build (route validation)**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build OK (no new route; this slice only changes UI + AI prompt).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx"
git commit -m "feat(web): choose curriculum framework when generating kisi-kisi"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/ai test` passes (curriculum + injection tests green).
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds.
- [ ] Manual (real env): generate kisi-kisi with K-13 selected → indicators reference KI/KD; with Merdeka → CP/Fase framing. The generated blueprint's `curriculumType` matches the selection (already persisted by the route).

## Self-review notes
- Spec coverage: "Template Kurikulum Merdeka & K-13" ✓ (Task 1–2); curriculum picker UI ✓ (Task 3).
- `custom` returns empty guidance → preserves Phase 1 free-form behavior (no regression).
- Type names consistent across tasks: `curriculumTemplate`, `CurriculumType`, enum `'merdeka'|'k13'|'custom'` (matches `packages/validators/src/index.ts:113` and DB enum).
- No new route → no IDOR surface; existing route already enum-validates + workspace-scopes.
