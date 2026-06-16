'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Assignment = { id: string; assessmentTitle: string }
type Student = { studentId: string; name: string; email: string }
type Sub = { assignmentId: string; studentId: string; score: number | null }
type ClassRow = { id: string; name: string }

export default function ClassResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/classes/${id}/results`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setCls(data.class)
        setAssignments(data.assignments ?? [])
        setStudents(data.students ?? [])
        setSubs(data.submissions ?? [])
      })
      .catch(() => setCls(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat hasil...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  const scoreOf = (studentId: string, assignmentId: string) => {
    const s = subs.find((x) => x.studentId === studentId && x.assignmentId === assignmentId)
    return s && s.score !== null ? String(s.score) : '—'
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Hasil — {cls.name}</h1>
      {students.length === 0 ? (
        <p className="text-sm text-neutral-400">Belum ada murid terdaftar.</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-neutral-600">Murid</th>
                {assignments.map((a) => (
                  <th key={a.id} className="text-center px-4 py-2 font-medium text-neutral-600">{a.assessmentTitle}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{s.name} <span className="text-neutral-400">{s.email}</span></td>
                  {assignments.map((a) => (
                    <td key={a.id} className="text-center px-4 py-2 text-neutral-700">{scoreOf(s.studentId, a.id)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
