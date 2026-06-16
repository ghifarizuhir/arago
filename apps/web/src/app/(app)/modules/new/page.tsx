'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function NewModulePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Judul modul tidak boleh kosong.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      setStatus('Membuat modul...');
      const createRes = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!createRes.ok) throw new Error('Gagal membuat modul.');
      const { module: createdModule } = await createRes.json();

      if (file) {
        setStatus('Mengunggah berkas...');
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await fetch('/api/upload/module', { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Gagal mengunggah berkas.');
        const { fileUrl } = await uploadRes.json();

        await fetch(`/api/modules/${createdModule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileUrl }),
        });

        setStatus('Menganalisis konten dengan AI...');
        const extractRes = await fetch('/api/ai/extract-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId: createdModule.id }),
        });
        if (!extractRes.ok) {
          console.warn('AI extraction failed, continuing...');
        }
      }

      router.push(`/modules/${createdModule.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Modul Baru</h1>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Judul Modul <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Matematika Kelas 7 — Persamaan Linear"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="file" className="block text-sm font-medium text-gray-700">
            Berkas Modul <span className="text-gray-400 font-normal">(opsional, PDF/DOCX, maks. 10 MB)</span>
          </label>
          <input
            id="file"
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {status && <p className="text-sm text-indigo-600">{status}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Memproses...' : 'Simpan Modul'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
