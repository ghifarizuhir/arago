'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Option = { id: string; text: string }

type AssessmentItem = {
  id: string
  question: string
  options: Option[]
  correctAnswer: string
  bloomLevel: string | null
  indicatorRef: string | null
  sortOrder: number
}

type Assessment = {
  id: string
  title: string
  status: 'draft' | 'published'
  workspaceId: string
}

type EditingItem = {
  question: string
  options: Option[]
  correctAnswer: string
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<AssessmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditingItem | null>(null)
  const [error, setError] = useState('')

  const loadAssessment = () => {
    setLoading(true)
    fetch(`/api/assessments/${id}`)
      .then((r) => r.json())
      .then(({ assessment: a, items: its }: { assessment: Assessment; items: AssessmentItem[] }) => {
        setAssessment(a)
        setItems(its ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAssessment()
  }, [id])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal generate soal.')
        return
      }
      const { items: newItems }: { items: AssessmentItem[] } = await res.json()
      setItems((prev) => [...prev, ...newItems])
    } catch {
      setError('Terjadi kesalahan saat generate soal.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePublish = async () => {
    if (!assessment) return
    setPublishing(true)
    const next = assessment.status === 'draft' ? 'published' : 'draft'
    try {
      const res = await fetch(`/api/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        const { assessment: updated } = await res.json()
        setAssessment(updated)
      }
    } finally {
      setPublishing(false)
    }
  }

  const startEdit = (item: AssessmentItem) => {
    setEditingId(item.id)
    setEditState({
      question: item.question,
      options: item.options.map((o) => ({ ...o })),
      correctAnswer: item.correctAnswer,
    })
  }

  const saveEdit = async (itemId: string) => {
    if (!editState) return
    const res = await fetch(`/api/assessments/${id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editState),
    })
    if (res.ok) {
      const { item: updated }: { item: AssessmentItem } = await res.json()
      setItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)))
    }
    setEditingId(null)
    setEditState(null)
  }

  const deleteItem = async (itemId: string) => {
    const res = await fetch(`/api/assessments/${id}/items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((it) => it.id !== itemId))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat asesmen...</div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-sm">Asesmen tidak ditemukan.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{assessment.title}</h1>
          <span
            className={[
              'mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              assessment.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600',
            ].join(' ')}
          >
            {assessment.status === 'published' ? 'Diterbitkan' : 'Draft'}
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || assessment.status === 'published'}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Soal'}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              assessment.status === 'draft'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700',
            ].join(' ')}
          >
            {publishing ? '...' : assessment.status === 'draft' ? 'Terbitkan' : 'Jadikan Draft'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg text-neutral-400 text-sm">
          Belum ada soal. Klik &quot;Generate Soal&quot; untuk membuat soal otomatis.
        </div>
      ) : (
        <ol className="space-y-4">
          {items.map((item, idx) => {
            const isEditing = editingId === item.id
            return (
              <li key={item.id} className="p-4 bg-white border border-neutral-200 rounded-lg">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className="text-xs font-semibold text-neutral-400">Soal {idx + 1}</span>
                  {assessment.status === 'draft' && (
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveEdit(item.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Simpan
                          </button>
                          <button type="button" onClick={() => { setEditingId(null); setEditState(null) }} className="text-xs text-neutral-400 hover:text-neutral-600">
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(item)} className="text-xs text-neutral-500 hover:text-neutral-700">
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteItem(item.id)} className="text-xs text-red-500 hover:text-red-700">
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && editState ? (
                  <div className="space-y-3">
                    <textarea
                      value={editState.question}
                      onChange={(e) => setEditState((s) => (s ? { ...s, question: e.target.value } : s))}
                      rows={3}
                      className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                    />
                    <div className="space-y-2">
                      {editState.options.map((opt, oi) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${item.id}`}
                            checked={editState.correctAnswer === opt.id}
                            onChange={() => setEditState((s) => (s ? { ...s, correctAnswer: opt.id } : s))}
                            className="text-blue-600"
                          />
                          <span className="text-xs font-medium text-neutral-500 w-5">{String.fromCharCode(65 + oi)}.</span>
                          <input
                            value={opt.text}
                            onChange={(e) => {
                              const text = e.target.value
                              setEditState((s) =>
                                s ? { ...s, options: s.options.map((o) => (o.id === opt.id ? { ...o, text } : o)) } : s,
                              )
                            }}
                            className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-400">Pilih radio button untuk menandai jawaban benar.</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-neutral-800 mb-3">{item.question}</p>
                    <ul className="space-y-1.5">
                      {item.options.map((opt, oi) => (
                        <li
                          key={opt.id}
                          className={[
                            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg',
                            item.correctAnswer === opt.id ? 'bg-green-50 text-green-800 font-medium' : 'text-neutral-700',
                          ].join(' ')}
                        >
                          <span className="font-medium text-neutral-400 text-xs w-5">{String.fromCharCode(65 + oi)}.</span>
                          {opt.text}
                          {item.correctAnswer === opt.id && <span className="ml-auto text-xs text-green-600">✓ Benar</span>}
                        </li>
                      ))}
                    </ul>
                    {item.bloomLevel && <p className="mt-2 text-xs text-neutral-400">Bloom: {item.bloomLevel}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
