'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type Enrolled = { studentId: string; name: string; email: string }
type AssignedMaterial = { materialId: string; title: string }
type Member = { userId: string; name: string; email: string }
type Material = { id: string; title: string }
type ClassRow = { id: string; name: string }

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [name, setName] = useState('')
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [materials, setMaterials] = useState<AssignedMaterial[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [wsMaterials, setWsMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [load])

  async function rename() {
    await fetch(`/api/classes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  async function enroll(studentId: string) {
    await fetch(`/api/classes/${id}/enrollments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [studentId] }),
    })
    await load()
  }

  async function unenroll(studentId: string) {
    await fetch(`/api/classes/${id}/enrollments/${studentId}`, { method: 'DELETE' })
    await load()
  }

  async function assignMaterial(materialId: string) {
    await fetch(`/api/classes/${id}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialIds: [materialId] }),
    })
    await load()
  }

  async function unassignMaterial(materialId: string) {
    await fetch(`/api/classes/${id}/materials/${materialId}`, { method: 'DELETE' })
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
                <button onClick={() => unenroll(e.studentId)} className="text-xs text-red-600 hover:underline">Keluarkan</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah murid</div>
        <ul className="space-y-1">
          {members.filter((m) => !enrolledIds.has(m.userId)).map((m) => (
            <li key={m.userId} className="flex items-center justify-between p-2 text-sm">
              <span>{m.name} <span className="text-neutral-400">{m.email}</span></span>
              <button onClick={() => enroll(m.userId)} className="text-xs text-blue-600 hover:underline">Tambah</button>
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
                <button onClick={() => unassignMaterial(m.materialId)} className="text-xs text-red-600 hover:underline">Hapus</button>
              </li>
            ))}
          </ul>
        )}
        <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Tambah bahan ajar</div>
        <ul className="space-y-1">
          {wsMaterials.filter((m) => !assignedIds.has(m.id)).map((m) => (
            <li key={m.id} className="flex items-center justify-between p-2 text-sm">
              <span>{m.title}</span>
              <button onClick={() => assignMaterial(m.id)} className="text-xs text-blue-600 hover:underline">Tambah</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
