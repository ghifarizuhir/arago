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
