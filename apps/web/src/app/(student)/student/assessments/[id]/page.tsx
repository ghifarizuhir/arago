'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; sortOrder: number }
type Assessment = { id: string; title: string; status: string }

export default function TakeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<AssessmentItem[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/assessments/${id}`)
      .then((r) => r.json())
      .then(({ assessment: a, items: its }: { assessment: Assessment; items: AssessmentItem[] }) => {
        setAssessment(a)
        setItems(its ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleAnswer = (itemId: string, choiceId: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: choiceId }))
  }

  const handleSubmit = async () => {
    if (Object.keys(answers).length < items.length) {
      const unanswered = items.length - Object.keys(answers).length
      if (!confirm(`Masih ada ${unanswered} soal yang belum dijawab. Lanjutkan?`)) return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/student/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: id, answers }),
      })
      if (res.status === 409) {
        const data = await res.json()
        router.push(`/student/assessments/${id}/results?submissionId=${data.submissionId}`)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal mengumpulkan jawaban.')
        return
      }
      const { submissionId } = await res.json()
      router.push(`/student/assessments/${id}/results?submissionId=${submissionId}`)
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat soal...</div>
      </div>
    )
  }

  if (!assessment || assessment.status !== 'published') {
    return <div className="text-center py-16 text-neutral-400 text-sm">Asesmen tidak tersedia.</div>
  }

  const answeredCount = Object.keys(answers).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-neutral-900">{assessment.title}</h1>
        <span className="text-sm text-neutral-500">{answeredCount}/{items.length} dijawab</span>
      </div>

      <ol className="space-y-6 mb-8">
        {items.map((item, idx) => (
          <li key={item.id} className="bg-white border border-neutral-200 rounded-lg p-4">
            <p className="text-sm font-medium text-neutral-800 mb-3">{idx + 1}. {item.question}</p>
            <ul className="space-y-2">
              {item.options.map((opt, oi) => (
                <li key={opt.id}>
                  <label className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-neutral-50">
                    <input
                      type="radio"
                      name={`item-${item.id}`}
                      value={opt.id}
                      checked={answers[item.id] === opt.id}
                      onChange={() => handleAnswer(item.id, opt.id)}
                      className="text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-xs font-medium text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                    <span className="text-sm text-neutral-700">{opt.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {submitting ? 'Mengumpulkan...' : 'Kumpulkan Jawaban'}
      </button>
    </div>
  )
}
