# Arago Phase 1 — Slice 4: Bahan Ajar & Kisi-kisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher can generate + edit a Bahan Ajar (Tiptap rich-text, auto-save, publish) from a module, then generate + edit a Kisi-kisi (blueprint) with inline indicator editing.

**Architecture:** Content chain step 2→3. Bahan Ajar = AI-drafted HTML stored on `teaching_materials`, edited in a Tiptap editor with debounced auto-save. Kisi-kisi = AI-suggested indicators (jsonb) on `blueprints`, edited inline.

**Tech Stack:** Tiptap (StarterKit), `@arago/ai`, Drizzle, `uuid` for fresh indicator ids.

**Slice sequence:** Slice 4 of 5. Requires Slices 1–3. Run before Slice 5.

**Reconciliation note:** `blueprints.creatorId` is NOT NULL in the schema. Every blueprint insert (manual POST and AI generate) MUST set `creatorId` from the session — this slice does so (the original draft omitted it, which would have failed the NOT NULL constraint).

**🔒 SECURITY — workspace-scope every by-id query (applies to ALL routes in this slice):** The code blocks below scope some handlers only by row `id` (+ `deletedAt`/`creatorId`). That is an IDOR gap: any authenticated user could read/mutate another workspace's material or blueprint by guessing its UUID. When implementing, EVERY by-id GET/PATCH/DELETE must also confirm the row belongs to the caller's active workspace. Since `teaching_materials` and `blueprints` have no `workspaceId` column directly, join up the chain: material → module.workspaceId, blueprint → material → module.workspaceId. Read the active workspace via `getCurrentWorkspaceId()`; if the row's owning workspace ≠ the active workspace, return 404. Creator checks (`creatorId === session.user.id`) stay as an additional guard for mutations but do NOT replace workspace scoping on reads.

---

### Task 1: Bahan Ajar (generate + Tiptap editor + CRUD)

**Files:**
- Create: `apps/web/src/app/api/materials/route.ts`
- Create: `apps/web/src/app/api/materials/[id]/route.ts`
- Create: `apps/web/src/app/api/ai/generate-material/route.ts`
- Create: `apps/web/src/components/editor/rich-text-editor.tsx`
- Create: `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx`
- Modify: `apps/web/src/app/(app)/modules/[id]/page.tsx` (add "Generate Bahan Ajar" button)

- [ ] **Step 1.1: GET/POST /api/materials** — `apps/web/src/app/api/materials/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const createSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1).max(500),
  content: z.string().default(''),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const moduleId = req.nextUrl.searchParams.get('moduleId')
  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId is required' }, { status: 400 })
  }

  const materials = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.moduleId, moduleId), isNull(teachingMaterials.deletedAt)))
    .orderBy(teachingMaterials.createdAt)

  return NextResponse.json({ materials })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { moduleId, title, content } = parsed.data

  const [material] = await db
    .insert(teachingMaterials)
    .values({
      moduleId,
      creatorId: session.user.id,
      title,
      content,
      status: 'draft',
    })
    .returning()

  return NextResponse.json({ material }, { status: 201 })
}
```
Expected: GET returns `{ materials }` for a module. POST creates a draft and returns `{ material }` (201).

- [ ] **Step 1.2: GET/PATCH/DELETE /api/materials/[id]** — `apps/web/src/app/api/materials/[id]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const [material] = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.id, id), isNull(teachingMaterials.deletedAt)))
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  return NextResponse.json({ material })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.id, id), isNull(teachingMaterials.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [updated] = await db
    .update(teachingMaterials)
    .set(parsed.data)
    .where(eq(teachingMaterials.id, id))
    .returning()

  return NextResponse.json({ material: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const { id } = await params

  const [existing] = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.id, id), isNull(teachingMaterials.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (existing.creatorId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db
    .update(teachingMaterials)
    .set({ deletedAt: new Date() })
    .where(eq(teachingMaterials.id, id))

  return NextResponse.json({ success: true })
}
```
Expected: PATCH accepts `{ title?, content?, status? }`, checks creator. DELETE soft-deletes.

- [ ] **Step 1.3: POST /api/ai/generate-material** — `apps/web/src/app/api/ai/generate-material/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingModules, teachingMaterials } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { generateMaterial } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  moduleId: z.string().uuid(),
  topic: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { moduleId, topic } = parsed.data

  const [module_] = await db
    .select()
    .from(teachingModules)
    .where(and(eq(teachingModules.id, moduleId), isNull(teachingModules.deletedAt)))
    .limit(1)

  if (!module_) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  }

  if (!module_.extractedText) {
    return NextResponse.json({ error: 'Module has no extracted text' }, { status: 422 })
  }

  const generated = await generateMaterial(module_.title, module_.extractedText, topic)

  const [material] = await db
    .insert(teachingMaterials)
    .values({
      moduleId,
      creatorId: session.user.id,
      title: generated.title,
      content: generated.content,
      status: 'draft',
    })
    .returning()

  return NextResponse.json({ material }, { status: 201 })
}
```
Expected: Returns `{ material }` with AI-generated title + Tiptap HTML content (201).

- [ ] **Step 1.4: RichTextEditor** — `apps/web/src/components/editor/rich-text-editor.tsx`
```tsx
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  editable?: boolean
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={[
        'px-2 py-1 rounded text-sm font-medium transition-colors',
        active ? 'bg-neutral-800 text-white' : 'bg-transparent text-neutral-600 hover:bg-neutral-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editable, editor])

  if (!editor) return null

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      {editable && (
        <div className="flex flex-wrap gap-1 p-2 border-b border-neutral-200 bg-neutral-50">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
            B
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
            <em>I</em>
          </ToolbarButton>
          <div className="w-px bg-neutral-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>
            H1
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
            H2
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
            H3
          </ToolbarButton>
          <div className="w-px bg-neutral-200 mx-1" />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
            • List
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
            1. List
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[200px] focus-within:outline-none"
      />
    </div>
  )
}
```
Expected: Toolbar renders when `editable`. Calls `onChange` with HTML on each keystroke. `immediatelyRender: false` avoids Next SSR hydration warnings.

- [ ] **Step 1.5: Material editor page** — `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx`
```tsx
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { RichTextEditor } from '@/components/editor/rich-text-editor'

type Material = {
  id: string
  moduleId: string
  title: string
  content: string
  status: 'draft' | 'published'
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function MaterialEditorPage() {
  const { materialId } = useParams<{ id: string; materialId: string }>()
  const [material, setMaterial] = useState<Material | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/materials/${materialId}`)
      .then((r) => r.json())
      .then(({ material: m }: { material: Material }) => {
        setMaterial(m)
        setTitle(m.title)
        setContent(m.content)
      })
      .finally(() => setLoading(false))
  }, [materialId])

  const save = useCallback(
    async (patch: Partial<Pick<Material, 'title' | 'content' | 'status'>>) => {
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/materials/${materialId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error('Save failed')
        const { material: updated }: { material: Material } = await res.json()
        setMaterial(updated)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
      }
    },
    [materialId],
  )

  const handleContentChange = useCallback(
    (html: string) => {
      setContent(html)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setSaveStatus('saving')
      debounceRef.current = setTimeout(() => {
        save({ content: html })
      }, 1000)
    },
    [save],
  )

  const handleTitleBlur = () => {
    if (material && title !== material.title) {
      save({ title })
    }
  }

  const handleStatusToggle = async () => {
    if (!material) return
    const next = material.status === 'draft' ? 'published' : 'draft'
    await save({ status: next })
  }

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
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full text-2xl font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none pb-1 mb-4 transition-colors"
            placeholder="Judul materi..."
          />
          <RichTextEditor content={content} onChange={handleContentChange} editable={true} />
        </div>

        <div className="w-56 shrink-0">
          <div className="sticky top-8 space-y-4">
            <div className="text-sm text-neutral-400 h-5">
              {saveStatus === 'saving' && 'Menyimpan...'}
              {saveStatus === 'saved' && <span className="text-green-600">Tersimpan</span>}
              {saveStatus === 'error' && <span className="text-red-500">Gagal menyimpan</span>}
            </div>

            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Status</div>
              <span
                className={[
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  material.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
                ].join(' ')}
              >
                {material.status === 'published' ? 'Diterbitkan' : 'Draft'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleStatusToggle}
              className={[
                'w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                material.status === 'draft'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700',
              ].join(' ')}
            >
              {material.status === 'draft' ? 'Terbitkan' : 'Jadikan Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```
Expected: Loads material, Tiptap editor, 1 s debounced auto-save, title save on blur, publish toggle.

- [ ] **Step 1.6: Add "Generate Bahan Ajar" to module detail** — Modify `apps/web/src/app/(app)/modules/[id]/page.tsx`

Add a client island so the teacher can trigger generation. Create `apps/web/src/components/generate-material-button.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateMaterialButton({ moduleId, disabled }: { moduleId: string; disabled: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal generate bahan ajar.')
        return
      }
      const { material } = await res.json()
      router.push(`/modules/${moduleId}/materials/${material.id}`)
    } catch {
      setError('Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={disabled || loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        title={disabled ? 'Ekstrak konten modul terlebih dahulu' : undefined}
      >
        {loading ? 'Generating...' : 'Generate Bahan Ajar'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
```

Then in `apps/web/src/app/(app)/modules/[id]/page.tsx`, add the import and render the button in the header. Replace the header `<div className="flex items-start justify-between">…</div>` block with:
```tsx
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
        <GenerateMaterialButton moduleId={module_.id} disabled={!module_.extractedText} />
      </div>
```
And add at the top of the file:
```tsx
import { GenerateMaterialButton } from '@/components/generate-material-button'
```
Expected: Button disabled until the module has `extractedText`; on success routes to the new material editor.

- [ ] **Step 1.7: Commit**
```bash
git add apps/web/src/app/api/materials/route.ts \
        "apps/web/src/app/api/materials/[id]/route.ts" \
        apps/web/src/app/api/ai/generate-material/route.ts \
        apps/web/src/components/editor/rich-text-editor.tsx \
        apps/web/src/components/generate-material-button.tsx \
        "apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx" \
        "apps/web/src/app/(app)/modules/[id]/page.tsx"
git commit -m "feat(web): bahan ajar CRUD, AI generate, Tiptap editor with auto-save (KAR-9)"
```

---

### Task 2: Kisi-kisi (blueprint generate + inline indicator editor)

**Files:**
- Create: `apps/web/src/app/api/blueprints/route.ts`
- Create: `apps/web/src/app/api/blueprints/[id]/route.ts`
- Create: `apps/web/src/app/api/ai/generate-blueprint/route.ts`
- Create: `apps/web/src/app/(app)/blueprints/page.tsx`
- Create: `apps/web/src/app/(app)/blueprints/[id]/page.tsx`

> All blueprint inserts set `creatorId` (NOT NULL in schema).

- [ ] **Step 2.1: GET/POST /api/blueprints** — `apps/web/src/app/api/blueprints/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const indicatorSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  bloomLevel: z.string().min(1),
  competency: z.string().min(1),
})

const createSchema = z.object({
  materialId: z.string().uuid(),
  title: z.string().min(1).max(500),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']),
  indicators: z.array(indicatorSchema).default([]),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const materialId = req.nextUrl.searchParams.get('materialId')
  if (!materialId) {
    return NextResponse.json({ error: 'materialId is required' }, { status: 400 })
  }

  const result = await db
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.materialId, materialId), isNull(blueprints.deletedAt)))
    .orderBy(blueprints.createdAt)

  return NextResponse.json({ blueprints: result })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [blueprint] = await db
    .insert(blueprints)
    .values({ ...parsed.data, creatorId: session.user.id })
    .returning()

  return NextResponse.json({ blueprint }, { status: 201 })
}
```
Expected: GET filtered by `materialId`. POST inserts with `creatorId` and returns the new blueprint.

- [ ] **Step 2.2: GET/PATCH/DELETE /api/blueprints/[id]** — `apps/web/src/app/api/blueprints/[id]/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { blueprints } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { z } from 'zod'

const indicatorSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  bloomLevel: z.string().min(1),
  competency: z.string().min(1),
})

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']).optional(),
  indicators: z.array(indicatorSchema).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const [blueprint] = await db
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.id, id), isNull(blueprints.deletedAt)))
    .limit(1)

  if (!blueprint) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  return NextResponse.json({ blueprint })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [existing] = await db
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.id, id), isNull(blueprints.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  const [updated] = await db
    .update(blueprints)
    .set(parsed.data)
    .where(eq(blueprints.id, id))
    .returning()

  return NextResponse.json({ blueprint: updated })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const [existing] = await db
    .select()
    .from(blueprints)
    .where(and(eq(blueprints.id, id), isNull(blueprints.deletedAt)))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
  }

  await db
    .update(blueprints)
    .set({ deletedAt: new Date() })
    .where(eq(blueprints.id, id))

  return NextResponse.json({ success: true })
}
```
Expected: PATCH merges provided fields. DELETE soft-deletes. 404 if already deleted.

- [ ] **Step 2.3: POST /api/ai/generate-blueprint** — `apps/web/src/app/api/ai/generate-blueprint/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@arago/db/client'
import { teachingMaterials, blueprints } from '@arago/db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { generateBlueprint } from '@arago/ai'
import { z } from 'zod'

const bodySchema = z.object({
  materialId: z.string().uuid(),
  curriculumType: z.enum(['merdeka', 'k13', 'custom']),
})

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth()
  if (error || !session) return error!

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { materialId, curriculumType } = parsed.data

  const [material] = await db
    .select()
    .from(teachingMaterials)
    .where(and(eq(teachingMaterials.id, materialId), isNull(teachingMaterials.deletedAt)))
    .limit(1)

  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 })
  }

  if (!material.content) {
    return NextResponse.json({ error: 'Material has no content' }, { status: 422 })
  }

  const generated = await generateBlueprint(material.title, material.content, curriculumType)

  const [blueprint] = await db
    .insert(blueprints)
    .values({
      materialId,
      creatorId: session.user.id,
      title: generated.title,
      curriculumType,
      indicators: generated.indicators,
    })
    .returning()

  return NextResponse.json({ blueprint }, { status: 201 })
}
```
Expected: Calls `generateBlueprint()`, inserts with `creatorId` + indicators jsonb, returns `{ blueprint }`.

- [ ] **Step 2.4: Blueprint list page** — `apps/web/src/app/(app)/blueprints/page.tsx`
```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@arago/db/client'
import { blueprints, teachingMaterials, teachingModules } from '@arago/db/schema'
import { eq, isNull, and, inArray } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth/guards'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export default async function BlueprintsPage() {
  const { error } = await requireAuth()
  if (error) return redirect('/login')

  const workspaceId = await getCurrentWorkspaceId()
  if (!workspaceId) return redirect('/workspaces')

  const modules = await db
    .select({ id: teachingModules.id, title: teachingModules.title })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))

  const moduleIds = modules.map((m) => m.id)

  const materials =
    moduleIds.length === 0
      ? []
      : await db
          .select({
            id: teachingMaterials.id,
            title: teachingMaterials.title,
            moduleId: teachingMaterials.moduleId,
          })
          .from(teachingMaterials)
          .where(and(inArray(teachingMaterials.moduleId, moduleIds), isNull(teachingMaterials.deletedAt)))

  const materialIds = materials.map((m) => m.id)

  const allBlueprints =
    materialIds.length === 0
      ? []
      : await db
          .select()
          .from(blueprints)
          .where(and(inArray(blueprints.materialId, materialIds), isNull(blueprints.deletedAt)))
          .orderBy(blueprints.createdAt)

  const materialMap = new Map(materials.map((m) => [m.id, m]))
  const moduleMap = new Map(modules.map((m) => [m.id, m]))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Kisi-kisi</h1>

      {allBlueprints.length === 0 ? (
        <div className="text-center py-16 text-neutral-400">
          <p className="text-sm">Belum ada kisi-kisi. Generate dari halaman materi.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {allBlueprints.map((bp) => {
            const material = materialMap.get(bp.materialId)
            const moduleRef = material ? moduleMap.get(material.moduleId) : undefined
            const indicatorCount = Array.isArray(bp.indicators) ? bp.indicators.length : 0
            return (
              <li key={bp.id}>
                <Link
                  href={`/blueprints/${bp.id}`}
                  className="block p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-neutral-900">{bp.title}</p>
                      <p className="text-sm text-neutral-500 mt-0.5">
                        {moduleRef?.title} › {material?.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                        {bp.curriculumType}
                      </span>
                      <span className="text-xs text-neutral-400">{indicatorCount} indikator</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```
Expected: Lists all blueprints in the current workspace with module/material breadcrumb + indicator count.

- [ ] **Step 2.5: Blueprint detail page (inline indicator editor)** — `apps/web/src/app/(app)/blueprints/[id]/page.tsx`
```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

type Indicator = {
  id: string
  description: string
  bloomLevel: string
  competency: string
}

type Blueprint = {
  id: string
  materialId: string
  title: string
  curriculumType: 'merdeka' | 'k13' | 'custom'
  indicators: Indicator[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const BLOOM_LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']

export default function BlueprintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [title, setTitle] = useState('')
  const [curriculumType, setCurriculumType] = useState<'merdeka' | 'k13' | 'custom'>('merdeka')
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/blueprints/${id}`)
      .then((r) => r.json())
      .then(({ blueprint: bp }: { blueprint: Blueprint }) => {
        setBlueprint(bp)
        setTitle(bp.title)
        setCurriculumType(bp.curriculumType)
        setIndicators(bp.indicators ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  const save = useCallback(async () => {
    setSaveState('saving')
    try {
      const res = await fetch(`/api/blueprints/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, curriculumType, indicators }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { blueprint: updated }: { blueprint: Blueprint } = await res.json()
      setBlueprint(updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
    }
  }, [id, title, curriculumType, indicators])

  const updateIndicator = (index: number, field: keyof Indicator, value: string) => {
    setIndicators((prev) => prev.map((ind, i) => (i === index ? { ...ind, [field]: value } : ind)))
  }

  const deleteIndicator = (index: number) => {
    setIndicators((prev) => prev.filter((_, i) => i !== index))
  }

  const addIndicator = () => {
    setIndicators((prev) => [...prev, { id: uuidv4(), description: '', bloomLevel: 'C1', competency: '' }])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat kisi-kisi...</div>
      </div>
    )
  }

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-sm">Kisi-kisi tidak ditemukan.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none pb-1 flex-1 transition-colors"
          placeholder="Judul kisi-kisi..."
        />
        <div className="flex items-center gap-3 shrink-0">
          {saveState === 'saving' && <span className="text-sm text-neutral-400">Menyimpan...</span>}
          {saveState === 'saved' && <span className="text-sm text-green-600">Tersimpan</span>}
          {saveState === 'error' && <span className="text-sm text-red-500">Gagal menyimpan</span>}
          <button
            type="button"
            onClick={save}
            disabled={saveState === 'saving'}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Simpan
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Kurikulum</label>
        <div className="flex gap-2">
          {(['merdeka', 'k13', 'custom'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setCurriculumType(type)}
              className={[
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                curriculumType === type
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300',
              ].join(' ')}
            >
              {type === 'merdeka' ? 'Merdeka' : type === 'k13' ? 'K13' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-neutral-800">Indikator ({indicators.length})</h2>
          <button
            type="button"
            onClick={addIndicator}
            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
          >
            + Tambah Indikator
          </button>
        </div>

        {indicators.length === 0 && (
          <div className="text-center py-10 border border-dashed border-neutral-200 rounded-lg text-neutral-400 text-sm">
            Belum ada indikator. Tambahkan indikator atau generate dari materi.
          </div>
        )}

        <ul className="space-y-3">
          {indicators.map((indicator, idx) => (
            <li key={indicator.id} className="p-4 bg-white border border-neutral-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 justify-between">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                  Indikator {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => deleteIndicator(idx)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Hapus
                </button>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Deskripsi</label>
                <textarea
                  value={indicator.description}
                  onChange={(e) => updateIndicator(idx, 'description', e.target.value)}
                  rows={2}
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  placeholder="Siswa mampu..."
                />
              </div>
              <div className="flex gap-3">
                <div className="w-32">
                  <label className="block text-xs text-neutral-500 mb-1">Bloom Level</label>
                  <select
                    value={indicator.bloomLevel}
                    onChange={(e) => updateIndicator(idx, 'bloomLevel', e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    {BLOOM_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-neutral-500 mb-1">Kompetensi</label>
                  <input
                    value={indicator.competency}
                    onChange={(e) => updateIndicator(idx, 'competency', e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Kompetensi dasar..."
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```
Expected: Indicators editable inline. "Tambah Indikator" appends a row with a fresh uuid. "Simpan" PATCHes the full array.

- [ ] **Step 2.6: Add "Generate Kisi-kisi" to the material editor**

In `apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx`, add a button in the right sidebar (below the publish button) that generates a blueprint from this material and navigates to it. Add to the imports:
```tsx
import { useRouter } from 'next/navigation'
```
Add inside the component (near other hooks):
```tsx
  const router = useRouter()
  const [genBlueprint, setGenBlueprint] = useState(false)

  async function handleGenerateBlueprint() {
    if (!material) return
    setGenBlueprint(true)
    try {
      const res = await fetch('/api/ai/generate-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: material.id, curriculumType: 'merdeka' }),
      })
      if (res.ok) {
        const { blueprint } = await res.json()
        router.push(`/blueprints/${blueprint.id}`)
      }
    } finally {
      setGenBlueprint(false)
    }
  }
```
And render below the publish button in the sidebar:
```tsx
            <button
              type="button"
              onClick={handleGenerateBlueprint}
              disabled={genBlueprint}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors disabled:opacity-50"
            >
              {genBlueprint ? 'Generating...' : 'Generate Kisi-kisi'}
            </button>
```
Expected: From the material editor, a teacher generates a Merdeka-curriculum blueprint and lands on its editor.

- [ ] **Step 2.7: Commit**
```bash
git add apps/web/src/app/api/blueprints/route.ts \
        "apps/web/src/app/api/blueprints/[id]/route.ts" \
        apps/web/src/app/api/ai/generate-blueprint/route.ts \
        "apps/web/src/app/(app)/blueprints/page.tsx" \
        "apps/web/src/app/(app)/blueprints/[id]/page.tsx" \
        "apps/web/src/app/(app)/modules/[id]/materials/[materialId]/page.tsx"
git commit -m "feat(web): kisi-kisi CRUD, AI generate blueprint, inline indicator editor (KAR-10)"
```

---

## Slice 4 Done — Definition of Done

- `pnpm --filter @arago/web test` still green
- Manual smoke: module with extractedText → Generate Bahan Ajar → edit + auto-save + publish → Generate Kisi-kisi → edit indicators + save

**Next:** Slice 5 — Asesmen & Student Portal (`2026-06-16-arago-phase1-slice5-asesmen-student.md`).
