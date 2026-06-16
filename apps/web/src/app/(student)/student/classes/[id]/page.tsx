'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Material = { id: string; title: string }
type Assignment = { id: string; assessmentTitle: string; openAt: string; dueAt: string; status: string }
type ClassRow = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  belum_dibuka: 'Belum dibuka',
  aktif: 'Aktif',
  lewat: 'Lewat',
  selesai: 'Sudah dikumpulkan',
}

export default function StudentClassPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/student/classes/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setCls(data.class)
        setMaterials(data.materials ?? [])
        setAssignments(data.assignments ?? [])
      })
      .catch(() => setCls(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat kelas...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">{cls.name}</h1>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Bahan Ajar</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id}>
                <Link href={`/student/materials/${m.id}`} className="block px-4 py-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-sm font-medium text-neutral-800">
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Asesmen</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada asesmen.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const clickable = a.status === 'aktif' || a.status === 'selesai'
              const inner = (
                <div className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg">
                  <span className="font-medium text-neutral-900">{a.assessmentTitle}</span>
                  <span className="text-xs text-neutral-500">{STATUS_LABEL[a.status] ?? a.status}</span>
                </div>
              )
              return (
                <li key={a.id}>
                  {clickable ? (
                    <Link href={`/student/assessments/${a.id}`} className="block hover:opacity-80">{inner}</Link>
                  ) : (
                    <div className="opacity-60">{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
