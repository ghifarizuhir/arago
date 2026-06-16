'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [material, setMaterial] = useState<Material | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(true)
  const [genBlueprint, setGenBlueprint] = useState(false)
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

  const handleGenerateBlueprint = async () => {
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

            <button
              type="button"
              onClick={handleGenerateBlueprint}
              disabled={genBlueprint}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors disabled:opacity-50"
            >
              {genBlueprint ? 'Generating...' : 'Generate Kisi-kisi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
