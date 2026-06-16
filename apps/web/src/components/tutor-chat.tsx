'use client'

import { useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'

interface TutorChatProps {
  materialId: string
}

export function TutorChat({ materialId }: TutorChatProps) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/ai/tutor',
    body: { materialId },
  })
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const busy = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex flex-col h-full border border-neutral-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Tutor AI
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">Tanya apa saja tentang materi ini.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <div className={m.role === 'user' ? 'font-medium text-neutral-900' : 'text-neutral-700'}>
              {m.role === 'user' ? 'Kamu' : 'Tutor'}
            </div>
            <div className="whitespace-pre-wrap text-neutral-700">{m.content}</div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="p-2 border-t border-neutral-200 flex gap-2">
        <label htmlFor="tutor-input" className="sr-only">Pesan</label>
        <input
          id="tutor-input"
          value={input}
          onChange={handleInputChange}
          disabled={busy}
          placeholder="Tanya tutor..."
          className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Kirim pesan"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-900 hover:bg-neutral-700 text-white disabled:opacity-50"
        >
          Kirim
        </button>
      </form>
    </div>
  )
}
