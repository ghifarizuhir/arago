'use client'

import { useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'

const CHIPS = [
  'Sederhanakan bahasa untuk kelas 7',
  'Tambah contoh konkret',
  'Buat ringkasan di akhir',
  'Sesuaikan dengan CP Fase E Kurikulum Merdeka',
]

// Extracts the last ```html ... ``` block from an assistant message, if present.
export function extractRevisedHtml(text: string): string | null {
  const matches = [...text.matchAll(/```html\s*([\s\S]*?)```/g)]
  const last = matches[matches.length - 1]
  return last ? last[1]!.trim() : null
}

interface MaterialChatProps {
  materialId: string
  onApply: (html: string) => void
}

export function MaterialChat({ materialId, onApply }: MaterialChatProps) {
  const { messages, input, handleInputChange, handleSubmit, append, status } = useChat({
    api: '/api/ai/chat',
    body: { materialId },
  })
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const busy = status === 'streaming' || status === 'submitted'

  const lastApplicableId = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && extractRevisedHtml(m.content) !== null)?.id

  return (
    <div className="flex flex-col h-full border border-neutral-200 rounded-lg bg-white">
      <div className="px-3 py-2 border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Asisten AI
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">
            Minta bantuan menyempurnakan bahan ajar ini.
          </p>
        )}
        {messages.map((m) => {
          const revised = m.role === 'assistant' ? extractRevisedHtml(m.content) : null
          return (
            <div key={m.id} className="text-sm">
              <div className={m.role === 'user' ? 'font-medium text-neutral-900' : 'text-neutral-700'}>
                {m.role === 'user' ? 'Anda' : 'AI'}
              </div>
              <div className="whitespace-pre-wrap text-neutral-700">{m.content}</div>
              {revised && m.id === lastApplicableId && (
                <button
                  type="button"
                  onClick={() => onApply(revised)}
                  className="mt-1 px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Terapkan ke editor
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="p-2 border-t border-neutral-200 space-y-2">
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy}
              onClick={() => append({ role: 'user', content: c })}
              aria-label={`Saran: ${c}`}
              className="px-2 py-1 rounded-full text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-600 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">Pesan</label>
          <input
            id="chat-input"
            value={input}
            onChange={handleInputChange}
            disabled={busy}
            placeholder="Tulis perintah..."
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
    </div>
  )
}
