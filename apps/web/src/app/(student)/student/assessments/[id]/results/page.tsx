'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; correctAnswer: string; sortOrder: number }
type Submission = { id: string; score: number | null; correctCount: number | null; totalItems: number; answers: Record<string, string>; submittedAt: string }

function ResultsPageInner() {
  const { id } = useParams<{ id: string }>() // assignmentId
  const searchParams = useSearchParams()
  const router = useRouter()
  const submissionId = searchParams.get('submissionId')

  const [items, setItems] = useState<AssessmentItem[]>([])
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!submissionId) {
      router.replace(`/student/assessments/${id}`)
      return
    }
    fetch(`/api/student/submissions/${submissionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(
        ({
          submission: sub,
          assessmentTitle: title,
          items: its,
        }: {
          submission: Submission
          assessmentTitle: string
          items: AssessmentItem[]
        }) => {
          setSubmission(sub)
          setAssessmentTitle(title ?? '')
          setItems(its ?? [])
        },
      )
      .catch(() => setSubmission(null))
      .finally(() => setLoading(false))
  }, [id, submissionId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat hasil...</div>
      </div>
    )
  }

  if (!submission) {
    return <div className="text-center py-16 text-neutral-400 text-sm">Hasil tidak ditemukan.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900">{assessmentTitle}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Nilai: <span className="font-semibold text-neutral-900">{submission.score ?? '—'}</span> / 100 · {submission.correctCount ?? '—'} dari {submission.totalItems} benar
        </p>
      </div>

      <ol className="space-y-6 mb-8">
        {items.map((item, idx) => {
          const chosen = submission.answers[item.id]
          return (
            <li key={item.id} className="bg-white border border-neutral-200 rounded-lg p-4">
              <p className="text-sm font-medium text-neutral-800 mb-3">{idx + 1}. {item.question}</p>
              <ul className="space-y-2">
                {item.options.map((opt, oi) => {
                  const isCorrect = opt.id === item.correctAnswer
                  const isChosen = opt.id === chosen
                  return (
                    <li
                      key={opt.id}
                      className={[
                        'flex items-center gap-3 p-2 rounded-lg text-sm',
                        isCorrect ? 'bg-green-50 text-green-800' : isChosen ? 'bg-red-50 text-red-700' : 'text-neutral-700',
                      ].join(' ')}
                    >
                      <span className="text-xs font-medium text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                      <span>{opt.text}</span>
                      {isCorrect && <span className="ml-auto text-xs font-medium">Benar</span>}
                      {isChosen && !isCorrect && <span className="ml-auto text-xs font-medium">Jawabanmu</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      <Link href="/student" className="text-sm text-blue-600 hover:underline">← Kembali ke dashboard</Link>
    </div>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ResultsPageInner />
    </Suspense>
  )
}
