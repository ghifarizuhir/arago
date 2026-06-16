'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Blueprint = {
  id: string
  title: string
  curriculumType: string
  materialId: string
}

export default function NewAssessmentPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [bpLoading, setBpLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/workspace-blueprints')
      .then((r) => r.json())
      .then(({ blueprints: bps }: { blueprints: Blueprint[] }) => setBlueprints(bps ?? []))
      .catch(() => setBlueprints([]))
      .finally(() => setBpLoading(false))
  }, [])

  const toggleBlueprint = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Judul tidak boleh kosong.')
      return
    }
    if (selectedIds.size === 0) {
      setError('Pilih minimal satu kisi-kisi.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), blueprintIds: [...selectedIds] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal membuat asesmen.')
        return
      }
      const { assessment } = await res.json()
      router.push(`/assessments/${assessment.id}`)
    } catch {
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Asesmen Baru</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">Judul Asesmen</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="cth. Ulangan Harian Bab 1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Kisi-kisi ({selectedIds.size} dipilih)
          </label>
          {bpLoading ? (
            <div className="text-sm text-neutral-400">Memuat kisi-kisi...</div>
          ) : blueprints.length === 0 ? (
            <div className="text-sm text-neutral-400">Belum ada kisi-kisi. Buat kisi-kisi terlebih dahulu.</div>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto border border-neutral-200 rounded-lg p-2">
              {blueprints.map((bp) => (
                <li key={bp.id}>
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-neutral-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(bp.id)}
                      onChange={() => toggleBlueprint(bp.id)}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="text-sm text-neutral-800">{bp.title}</span>
                    <span className="ml-auto text-xs text-neutral-400">{bp.curriculumType}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Membuat...' : 'Buat Asesmen'}
        </button>
      </form>
    </div>
  )
}
