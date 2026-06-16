'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewClassPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        setError('Gagal membuat kelas.')
        return
      }
      const { class: created } = await res.json()
      router.push(`/classes/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Kelas Baru</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Nama Kelas</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Kelas 7A"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          {saving ? 'Menyimpan...' : 'Buat Kelas'}
        </button>
      </form>
    </div>
  )
}
