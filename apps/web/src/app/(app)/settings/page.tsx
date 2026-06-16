'use client'

import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [wsId, setWsId] = useState<string | null>(null)
  const [wsName, setWsName] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then(({ user, workspace }) => {
        setName(user?.name ?? '')
        setWsId(workspace?.id ?? null)
        setWsName(workspace?.name ?? '')
      })
      .catch(() => {})
  }, [])

  async function saveProfile() {
    setStatus('')
    try {
      setSaving(true)
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      setStatus(res.ok ? 'Profil tersimpan.' : 'Gagal menyimpan profil.')
    } catch {
      setStatus('Gagal — periksa koneksi.')
    } finally {
      setSaving(false)
    }
  }

  async function saveWorkspace() {
    if (!wsId) return
    setStatus('')
    try {
      setSaving(true)
      const res = await fetch(`/api/workspaces/${wsId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName }),
      })
      setStatus(res.ok ? 'Workspace tersimpan.' : 'Gagal menyimpan workspace (perlu peran guru/owner).')
    } catch {
      setStatus('Gagal — periksa koneksi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-neutral-900">Pengaturan</h1>

      <section className="space-y-2">
        <label htmlFor="profile-name" className="block text-sm font-medium text-neutral-700">Nama</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
        <button type="button" onClick={saveProfile} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Simpan Profil</button>
      </section>

      <section className="space-y-2">
        <label htmlFor="ws-name" className="block text-sm font-medium text-neutral-700">Nama Workspace</label>
        <input id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!wsId} className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400 disabled:opacity-50" />
        <button type="button" onClick={saveWorkspace} disabled={saving || !wsId || !wsName.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">Simpan Workspace</button>
      </section>

      {status && <p className="text-sm text-neutral-600">{status}</p>}
    </div>
  )
}
