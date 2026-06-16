import { streamText, type CoreMessage } from 'ai';
import { getModel } from './providers/index.js';

export function buildTutorSystemPrompt(materialContent: string): string {
  return `Anda adalah tutor AI yang mendampingi murid membaca sebuah bahan ajar.
Jawab HANYA berdasarkan isi materi di bawah ini. Selalu gunakan Bahasa Indonesia yang ramah dan sesuai untuk murid.

Aturan ketat:
- Jika pertanyaan tidak dapat dijawab dari materi, katakan dengan sopan bahwa hal itu di luar materi dan arahkan murid kembali ke bahan ajar.
- JANGAN memberi jawaban soal asesmen/ujian atau mengerjakan tugas untuk murid. Jika diminta jawaban soal, tolak dan ajak murid memahami konsepnya.
- Jangan mengarang fakta di luar materi.

Isi bahan ajar:
"""
${materialContent}
"""`;
}

export function streamTutor(opts: {
  materialContent: string;
  messages: CoreMessage[];
}) {
  return streamText({
    model: getModel(),
    system: buildTutorSystemPrompt(opts.materialContent),
    messages: opts.messages,
  });
}
