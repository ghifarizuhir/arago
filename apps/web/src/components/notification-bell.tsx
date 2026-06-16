'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type Route } from 'next'

type Notif = { id: string; type: string; message: string; linkPath: string | null; readAt: string | null; createdAt: string }

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const { notifications, unreadCount } = await res.json()
      setItems(notifications ?? [])
      setUnread(unreadCount ?? 0)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function markAll() {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    await load()
  }

  async function openItem(n: Notif) {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id }),
    })
    setOpen(false)
    await load()
    if (n.linkPath) router.push(n.linkPath as Route)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
        className="relative rounded-md p-2 text-neutral-600 hover:bg-neutral-100"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
            <span className="text-sm font-semibold text-neutral-800">Notifikasi</span>
            <button type="button" onClick={markAll} className="text-xs text-blue-600 hover:underline">Tandai dibaca</button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-neutral-400">Tidak ada notifikasi.</li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={[
                      'block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50',
                      n.readAt ? 'text-neutral-500' : 'font-medium text-neutral-900',
                    ].join(' ')}
                  >
                    {n.message}
                    <span className="block text-xs text-neutral-400">{new Date(n.createdAt).toLocaleString('id-ID')}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
