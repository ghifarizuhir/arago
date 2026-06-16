'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type Option = { id: string; text: string }
type AssessmentItem = { id: string; question: string; options: Option[]; correctAnswer: string; sortOrder: number }
type Submission = { id: string; score: number; totalItems: number; answers: Record<string, string>; submittedAt: string }

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
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

    Promise.all([
      fetch(`/api/assessments/${id}`).then((r) => r.json()),
      fetch(`/api/student/submissions/${submissionId}`).then((r) => r.json()),
    ])
      .then(
        ([
          { assessment, items: its },
          { submission: sub },
        ]: [
          { assessment: { title: string }; items: AssessmentItem[] },
          { submission: Submission },
        ]) => {
          setAssessmentTitle(assessment?.title ?? '')
          setItems(its ?? [])
          setSubmission(sub)
        },
      )
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

  const correctCount = items.filter((item) => submission.answers[item.id] === item.correctAnswer).length

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">{assessmentTitle}</h1>
        <p className="text-neutral-500 text-sm mb-4">Hasil Asesmen</p>
        <div
          className={[
            'inline-flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 mb-2',
            submission.score >= 75 ? 'border-green-400 bg-green-50' : submission.score >= 50 ? 'border-yellow-400 bg-yellow-50' : 'border-red-400 bg-red-50',
          ].join(' ')}
        >
          <span
            className={[
              'text-4xl font-bold',
              submission.score >= 75 ? 'text-green-700' : submission.score >= 50 ? 'text-yellow-700' : 'text-red-700',
            ].join(' ')}
          >
            {submission.score}
          </span>
          <span className="text-xs text-neutral-500">/ 100</span>
        </div>
        <p className="text-sm text-neutral-600">{correctCount} dari {submission.totalItems} jawaban benar</p>
      </div>

      <ol className="space-y-4 mb-8">
        {items.map((item, idx) => {
          const studentAnswer = submission.answers[item.id]
          const isCorrect = studentAnswer === item.correctAnswer
          return (
            <li
              key={item.id}
              className={['p-4 border rounded-lg', isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'].join(' ')}
            >
              <div className="flex items-start gap-2 mb-3">
                <span
                  className={[
                    'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 mt-0.5',
                    isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
                  ].join(' ')}
                >
                  {isCorrect ? '✓' : '✗'}
                </span>
                <p className="text-sm font-medium text-neutral-800">{idx + 1}. {item.question}</p>
              </div>
              <ul className="space-y-1 ml-7">
                {item.options.map((opt, oi) => {
                  const isCorrectOpt = opt.id === item.correctAnswer
                  const isStudentChoice = opt.id === studentAnswer
                  return (
                    <li
                      key={opt.id}
                      className={[
                        'flex items-center gap-2 text-sm px-2 py-1 rounded',
                        isCorrectOpt
                          ? 'bg-green-200 text-green-900 font-medium'
                          : isStudentChoice && !isCorrectOpt
                          ? 'bg-red-200 text-red-900 line-through'
                          : 'text-neutral-600',
                      ].join(' ')}
                    >
                      <span className="text-xs text-neutral-400 w-4">{String.fromCharCode(65 + oi)}.</span>
                      {opt.text}
                      {isCorrectOpt && <span className="ml-auto text-xs text-green-700">Jawaban benar</span>}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>

      <Link
        href="/student"
        className="block text-center py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  )
}
