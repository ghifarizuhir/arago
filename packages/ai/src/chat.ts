import { streamText } from 'ai'
import { getModel } from './providers/index.js'

export function buildMaterialChatSystemPrompt(materialContent: string): string {
  return `Anda adalah asisten penulis perangkat ajar K-12 Indonesia.
Anda membantu guru menyempurnakan sebuah bahan ajar: menambah bagian, mengubah, menyederhanakan bahasa, atau menyesuaikan dengan kurikulum.
Selalu balas dalam Bahasa Indonesia yang jelas.

Aturan untuk menyunting konten:
- Jika guru meminta perubahan pada isi bahan ajar, tulis ULANG seluruh bahan ajar (versi lengkap yang sudah diperbarui) di dalam SATU blok berpagar \`\`\`html ... \`\`\`.
- Konten di dalam blok harus HTML yang valid untuk editor (gunakan <h2>, <p>, <ul>, <li>, <strong>).
- Di luar blok, beri penjelasan singkat tentang apa yang Anda ubah.
- Jika guru hanya bertanya/berdiskusi (tanpa minta perubahan), jawab biasa TANPA blok \`\`\`html.

Bahan ajar saat ini:
"""
${materialContent}
"""`
}

export function streamMaterialChat(opts: {
  materialContent: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}) {
  return streamText({
    model: getModel(),
    system: buildMaterialChatSystemPrompt(opts.materialContent),
    messages: opts.messages,
  })
}
