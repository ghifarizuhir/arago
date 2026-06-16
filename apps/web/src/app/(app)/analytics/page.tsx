'use client'

import { useEffect, useState } from 'react'

type Counts = { modules: number; materials: number; blueprints: number; assessments: number; classes: number }
type AvgRow = { assessmentId: string; title: string; avgScore: number; submissionCount: number }
type Analytics = { counts: Counts; students: number; submissionCount: number; avgByAssessment: AvgRow[] }

const CARD_LABELS: { key: keyof Counts; label: string }[] = [
  { key: 'modules', label: 'Modul Ajar' },
  { key: 'materials', label: 'Bahan Ajar' },
  { key: 'blueprints', label: 'Kisi-kisi' },
  { key: 'assessments', label: 'Asesmen' },
  { key: 'classes', label: 'Kelas' },
]

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat analitik...</div>
  }
  if (!data) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Gagal memuat analitik.</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">Analitik</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CARD_LABELS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-bold text-neutral-900">{data.counts[key]}</div>
            <div className="text-xs text-neutral-500">{label}</div>
          </div>
        ))}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-bold text-neutral-900">{data.students}</div>
          <div className="text-xs text-neutral-500">Murid Terdaftar</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-bold text-neutral-900">{data.submissionCount}</div>
          <div className="text-xs text-neutral-500">Pengumpulan</div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Rata-rata Nilai per Asesmen</h2>
        {data.avgByAssessment.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada pengumpulan.</p>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-neutral-600">Asesmen</th>
                  <th className="text-center px-4 py-2 font-medium text-neutral-600">Rata-rata</th>
                  <th className="text-center px-4 py-2 font-medium text-neutral-600">Pengumpulan</th>
                </tr>
              </thead>
              <tbody>
                {data.avgByAssessment.map((a) => (
                  <tr key={a.assessmentId} className="border-t border-neutral-100">
                    <td className="px-4 py-2 text-neutral-800">{a.title}</td>
                    <td className="text-center px-4 py-2 text-neutral-700">{a.avgScore}</td>
                    <td className="text-center px-4 py-2 text-neutral-700">{a.submissionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
