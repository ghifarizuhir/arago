'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface Assessment {
  id: string
  title: string
}

interface Material {
  id: string
  title: string
}

export default function StudentDashboardPage() {
  const { data: session } = useSession()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loadingAssessments, setLoadingAssessments] = useState(true)
  const [loadingMaterials, setLoadingMaterials] = useState(true)

  useEffect(() => {
    if (!session) return

    // Fetch assessments
    fetch('/api/student/submissions')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const uniqueAssessments: Assessment[] = []
        const seen = new Set<string>()
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.assessment && !seen.has(item.assessment.id)) {
              seen.add(item.assessment.id)
              uniqueAssessments.push({
                id: item.assessment.id,
                title: item.assessment.title,
              })
            }
          }
        }
        setAssessments(uniqueAssessments)
      })
      .catch(() => setAssessments([]))
      .finally(() => setLoadingAssessments(false))

    // Fetch materials
    fetch('/api/student/materials')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(({ materials: ms }: { materials: Material[] }) => setMaterials(ms ?? []))
      .catch(() => setMaterials([]))
      .finally(() => setLoadingMaterials(false))
  }, [session])

  if (!session) {
    return redirect('/login')
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Bahan Ajar</h2>
        {loadingMaterials ? (
          <div className="text-sm text-neutral-400">Memuat bahan ajar...</div>
        ) : materials.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/student/materials/${m.id}`}
                  className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800 transition-colors"
                >
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Asesmen Tersedia</h2>
        {loadingAssessments ? (
          <div className="text-sm text-neutral-400">Memuat asesmen...</div>
        ) : assessments.length === 0 ? (
          <div className="text-sm text-neutral-400">Belum ada asesmen yang tersedia.</div>
        ) : (
          <ul className="space-y-3">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/student/assessments/${a.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <span className="font-medium text-neutral-900">{a.title}</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Diterbitkan
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
