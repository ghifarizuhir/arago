'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

type Indicator = {
  id: string
  description: string
  bloomLevel: string
  competency: string
}

type Blueprint = {
  id: string
  materialId: string
  title: string
  curriculumType: 'merdeka' | 'k13' | 'custom'
  indicators: Indicator[]
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const BLOOM_LEVELS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']

export default function BlueprintDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null)
  const [title, setTitle] = useState('')
  const [curriculumType, setCurriculumType] = useState<'merdeka' | 'k13' | 'custom'>('merdeka')
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/blueprints/${id}`)
      .then((r) => r.json())
      .then(({ blueprint: bp }: { blueprint: Blueprint }) => {
        setBlueprint(bp)
        setTitle(bp.title)
        setCurriculumType(bp.curriculumType)
        setIndicators(bp.indicators ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  const save = useCallback(async () => {
    setSaveState('saving')
    try {
      const res = await fetch(`/api/blueprints/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, curriculumType, indicators }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { blueprint: updated }: { blueprint: Blueprint } = await res.json()
      setBlueprint(updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
    }
  }, [id, title, curriculumType, indicators])

  const updateIndicator = (index: number, field: keyof Indicator, value: string) => {
    setIndicators((prev) => prev.map((ind, i) => (i === index ? { ...ind, [field]: value } : ind)))
  }

  const deleteIndicator = (index: number) => {
    setIndicators((prev) => prev.filter((_, i) => i !== index))
  }

  const addIndicator = () => {
    setIndicators((prev) => [...prev, { id: uuidv4(), description: '', bloomLevel: 'C1', competency: '' }])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400 text-sm">Memuat kisi-kisi...</div>
      </div>
    )
  }

  if (!blueprint) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-sm">Kisi-kisi tidak ditemukan.</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-200 focus:border-neutral-400 focus:outline-none pb-1 flex-1 transition-colors"
          placeholder="Judul kisi-kisi..."
        />
        <div className="flex items-center gap-3 shrink-0">
          {saveState === 'saving' && <span className="text-sm text-neutral-400">Menyimpan...</span>}
          {saveState === 'saved' && <span className="text-sm text-green-600">Tersimpan</span>}
          {saveState === 'error' && <span className="text-sm text-red-500">Gagal menyimpan</span>}
          <button
            type="button"
            onClick={save}
            disabled={saveState === 'saving'}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Simpan
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Kurikulum</label>
        <div className="flex gap-2">
          {(['merdeka', 'k13', 'custom'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setCurriculumType(type)}
              className={[
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                curriculumType === type
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300',
              ].join(' ')}
            >
              {type === 'merdeka' ? 'Merdeka' : type === 'k13' ? 'K13' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-neutral-800">Indikator ({indicators.length})</h2>
          <button
            type="button"
            onClick={addIndicator}
            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
          >
            + Tambah Indikator
          </button>
        </div>

        {indicators.length === 0 && (
          <div className="text-center py-10 border border-dashed border-neutral-200 rounded-lg text-neutral-400 text-sm">
            Belum ada indikator. Tambahkan indikator atau generate dari materi.
          </div>
        )}

        <ul className="space-y-3">
          {indicators.map((indicator, idx) => (
            <li key={indicator.id} className="p-4 bg-white border border-neutral-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 justify-between">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                  Indikator {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => deleteIndicator(idx)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Hapus
                </button>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Deskripsi</label>
                <textarea
                  value={indicator.description}
                  onChange={(e) => updateIndicator(idx, 'description', e.target.value)}
                  rows={2}
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  placeholder="Siswa mampu..."
                />
              </div>
              <div className="flex gap-3">
                <div className="w-32">
                  <label className="block text-xs text-neutral-500 mb-1">Bloom Level</label>
                  <select
                    value={indicator.bloomLevel}
                    onChange={(e) => updateIndicator(idx, 'bloomLevel', e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    {BLOOM_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-neutral-500 mb-1">Kompetensi</label>
                  <input
                    value={indicator.competency}
                    onChange={(e) => updateIndicator(idx, 'competency', e.target.value)}
                    className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Kompetensi dasar..."
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
