'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Enrolled = { studentId: string; name: string; email: string }
type AssignedMaterial = { materialId: string; title: string }
type Member = { userId: string; name: string; email: string }
type Material = { id: string; title: string }
type ClassRow = { id: string; name: string }
type Assignment = { id: string; assessmentId: string; openAt: string; dueAt: string; assessmentTitle: string }
type Assessment = { id: string; title: string }

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [name, setName] = useState('')
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [materials, setMaterials] = useState<AssignedMaterial[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [wsMaterials, setWsMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [wsAssessments, setWsAssessments] = useState<Assessment[]>([])
  const [pickAssessment, setPickAssessment] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [dueAt, setDueAt] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${id}`)
    if (!res.ok) {
      setCls(null)
      setLoading(false)
      return
    }
    const data = await res.json()
    setCls(data.class)
    setName(data.class.name)
    setEnrolled(data.enrolled ?? [])
    setMaterials(data.materials ?? [])
    setLoading(false)
    const aRes = await fetch(`/api/classes/${id}/assignments`)
    if (aRes.ok) {
      const { assignments: as } = await aRes.json()
      setAssignments(as ?? [])
    }
  }, [id])

  useEffect(() => {
    load()
    fetch('/api/workspace-members')
      .then((r) => r.json())
      .then(({ members: m }: { members: Member[] }) => setMembers(m ?? []))
      .catch(() => setMembers([]))
    fetch('/api/workspace-materials')
      .then((r) => r.json())
      .then(({ materials: m }: { materials: Material[] }) => setWsMaterials(m ?? []))
      .catch(() => setWsMaterials([]))
    fetch('/api/assessments')
      .then((r) => r.json())
      .then(({ assessments: a }: { assessments: { id: string; title: string; status: string }[] }) =>
        setWsAssessments((a ?? []).filter((x) => x.status === 'published').map((x) => ({ id: x.id, title: x.title }))),
      )
      .catch(() => setWsAssessments([]))
  }, [load])

  async function rename() {
    if (name === cls?.name || !name.trim()) return
    try {
      const res = await fetch(`/api/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setCls((c) => (c ? { ...c, name } : c))
      } else {
        setName(cls?.name ?? '')
      }
    } catch {
      setName(cls?.name ?? '')
    }
  }

  async function enroll(studentId: string) {
    try {
      setBusy(true)
      await fetch(`/api/classes/${id}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [studentId] }),
      })
      await load()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function unenroll(studentId: string) {
    try {
      setBusy(true)
      await fetch(`/api/classes/${id}/enrollments/${studentId}`, { method: 'DELETE' })
      await load()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function assignMaterial(materialId: string) {
    try {
      setBusy(true)
      await fetch(`/api/classes/${id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialIds: [materialId] }),
      })
      await load()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function unassignMaterial(materialId: string) {
    try {
      setBusy(true)
      await fetch(`/api/classes/${id}/materials/${materialId}`, { method: 'DELETE' })
      await load()
    } catch {
    } finally {
      setBusy(false)
    }
  }

  async function createAssignment() {
    if (!pickAssessment || !openAt || !dueAt) return
    try {
      setBusy(true)
      const res = await fetch(`/api/classes/${id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId: pickAssessment, openAt, dueAt }),
      })
      if (res.ok) {
        setPickAssessment('')
        setOpenAt('')
        setDueAt('')
        await load()
      } else {
        alert('Gagal menugaskan asesmen. Pastikan tenggat setelah waktu buka.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment(assignmentId: string) {
    await fetch(`/api/classes/${id}/assignments/${assignmentId}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Memuat kelas...</div>
  }
  if (!cls) {
    return <div className="flex items-center justify-center h-64 text-red-500 text-sm">Kelas tidak ditemukan.</div>
  }

  const enrolledIds = new Set(enrolled.map((e) => e.studentId))
  const assignedIds = new Set(materials.map((m) => m.materialId))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <section>
        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Nama Kelas</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            className="flex-1 text-xl font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none pb-1"
          />
        </div>
        <Link href={`/classes/${id}/results`} className="text-sm text-blue-600 hover:underline">
          Lihat hasil →
        </Link>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Murid</h2>
        {enrolled.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Belum ada murid terdaftar.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {enrolled.map((e) => (
              <li key={e.studentId} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                <span className="text-sm text-neutral-800">{e.name} <span className="text-neutral-400">{e.email}</span></span>
                <button disabled={busy} onClick={() => unenroll(e.studentId)} className="text-xs text-red-600 hover:underline">Keluarkan</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah murid</div>
        <ul className="space-y-1">
          {members.filter((m) => !enrolledIds.has(m.userId)).map((m) => (
            <li key={m.userId} className="flex items-center justify-between p-2 text-sm">
              <span>{m.name} <span className="text-neutral-400">{m.email}</span></span>
              <button disabled={busy} onClick={() => enroll(m.userId)} className="text-xs text-blue-600 hover:underline">Tambah</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Bahan Ajar</h2>
        {materials.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Belum ada bahan ajar.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {materials.map((m) => (
              <li key={m.materialId} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                <span className="text-sm text-neutral-800">{m.title}</span>
                <button disabled={busy} onClick={() => unassignMaterial(m.materialId)} className="text-xs text-red-600 hover:underline">Hapus</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah bahan ajar</div>
        <ul className="space-y-1">
          {wsMaterials.filter((m) => !assignedIds.has(m.id)).map((m) => (
            <li key={m.id} className="flex items-center justify-between p-2 text-sm">
              <span>{m.title}</span>
              <button disabled={busy} onClick={() => assignMaterial(m.id)} className="text-xs text-blue-600 hover:underline">Tambah</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Asesmen</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-neutral-400 mb-3">Belum ada asesmen yang ditugaskan.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                <span className="text-sm text-neutral-800">
                  {a.assessmentTitle}
                  <span className="text-neutral-400"> · {new Date(a.openAt).toLocaleString('id-ID')} → {new Date(a.dueAt).toLocaleString('id-ID')}</span>
                </span>
                <button onClick={() => removeAssignment(a.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border border-neutral-200 rounded-lg p-3">
          <select
            value={pickAssessment}
            onChange={(e) => setPickAssessment(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm"
          >
            <option value="">Pilih asesmen...</option>
            {wsAssessments.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-neutral-500">Buka
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm" />
            </label>
            <label className="flex-1 text-xs text-neutral-500">Tenggat
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm" />
            </label>
          </div>
          <button
            onClick={createAssignment}
            disabled={!pickAssessment || !openAt || !dueAt || busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            Tugaskan
          </button>
        </div>
      </section>
    </div>
  )
}
