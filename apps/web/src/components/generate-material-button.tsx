'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateMaterialButton({ moduleId, disabled }: { moduleId: string; disabled: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Gagal generate bahan ajar.')
        return
      }
      const { material } = await res.json()
      router.push(`/modules/${moduleId}/materials/${material.id}`)
    } catch {
      setError('Terjadi kesalahan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={disabled || loading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        title={disabled ? 'Ekstrak konten modul terlebih dahulu' : undefined}
      >
        {loading ? 'Generating...' : 'Generate Bahan Ajar'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
