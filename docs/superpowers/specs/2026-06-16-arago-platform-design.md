# Arago Platform Design

**Date:** 2026-06-16  
**Status:** Approved  
**Stack:** Next.js 15 · Turborepo · Drizzle ORM · Supabase · Vercel AI SDK · Claude/OpenAI

---

## Overview

Arago adalah platform guru-murid berbasis AI untuk pendidikan Indonesia. Guru dapat membuat perangkat ajar (modul → bahan ajar → kisi-kisi → asesmen) dengan bantuan AI assistant. Murid membaca bahan ajar dan mengerjakan asesmen, dengan AI tutor sebagai pendamping belajar.

---

## 1. Model Pengguna & Workspace

**Model:** Guru mandiri + workspace (mirip Notion/Slack).

- User daftar secara personal (email + password)
- Guru membuat **Workspace** (nama sekolah, lembaga, atau kelas pribadi)
- Workspace punya invite link → murid & guru lain join
- Satu user bisa jadi anggota banyak workspace
- **Role per-workspace:** `owner` | `teacher` | `student`
- Semua konten terisolasi per workspace

---

## 2. Content Chain (Perangkat Ajar)

Pendekatan: **Guided Workflow + Shortcut** — default linear, tapi guru bisa melompat langsung ke step manapun. AI auto-draft step yang dilewati sebagai hidden draft.

```
Modul Ajar → Bahan Ajar → Kisi-kisi → Asesmen
```

### Modul Ajar
- Upload PDF/DOCX atau tulis dari awal
- AI ekstrak teks & ringkasan topik utama dari upload
- Status: `draft` | `published`

### Bahan Ajar
- 1-N per modul ajar
- AI generate draft dari konten modul
- Editor rich-text (Tiptap) + AI chat sidebar
- Status: `draft` | `published` (hanya published yang terlihat murid)

### Kisi-kisi (Blueprint)
- 1-N per bahan ajar
- AI suggest indikator & kompetensi dasar
- Support template: **Kurikulum Merdeka**, **K-13**, atau **custom**
- Indikator disimpan sebagai `jsonb[]` (fleksibel per kurikulum)
- Field: `curriculumType`, `indicators`, `bloomLevel`

### Asesmen
- Combine N kisi-kisi menjadi satu asesmen
- AI generate soal pilihan ganda (PG) per indikator
- Soal punya: `question`, `options (jsonb)`, `correctAnswer`, `bloomLevel`, `indicator`
- Guru preview + edit sebelum publish
- Auto-koreksi saat murid submit
- Status: `draft` | `published`

---

## 3. AI Pipeline

### Untuk Guru
| Trigger | AI Action |
|---|---|
| Upload modul | Ekstrak teks, generate ringkasan & topik |
| "Generate bahan ajar" | Draft lengkap dari konten modul |
| "Generate kisi-kisi" | Suggest indikator sesuai kurikulum pilihan |
| "Generate soal" | Soal PG per indikator dari kisi-kisi |
| Chat sidebar | Free-form refinement: tambah, ubah, sederhanakan |

**Chat sidebar** hadir di semua editor konten. Contoh perintah:
- "tambah bagian tentang sel tumbuhan"
- "buat 5 soal level C3 Bloom's Taxonomy"
- "sesuaikan dengan CP Fase E Kurikulum Merdeka"
- "sederhanakan bahasa untuk kelas 7"

AI generation pakai `generateObject` (Vercel AI SDK) untuk structured output. Chat sidebar pakai streaming SSE.

### Untuk Murid (AI Tutor)
- Murid bisa tanya AI saat membaca bahan ajar
- AI hanya menjawab berdasarkan konteks bahan ajar yang dipublish (RAG sederhana)
- Tidak menjawab di luar materi — mencegah jawaban soal asesmen

---

## 4. Fitur Murid

- Dashboard: daftar kelas & asesmen yang di-assign
- Baca bahan ajar yang dipublish guru (per kelas)
- Tanya AI tutor kontekstual saat membaca
- Kerjakan asesmen (soal PG, auto-submit)
- Lihat nilai & pembahasan setelah submit

---

## 5. Manajemen Kelas

- Guru buat **Kelas**, assign murid (via workspace member)
- Guru assign **Asesmen** ke kelas + set `openAt` & `dueAt`
- Guru lihat dashboard hasil: nilai per murid per asesmen
- Murid lihat kelas yang diikuti + tugas aktif

---

## 6. Data Model (Schema)

### Identity & Workspace
```
users              — id, email, name, passwordHash, createdAt, deletedAt
workspaces         — id, name, slug, ownerId, createdAt
workspaceMembers   — workspaceId, userId, role, joinedAt
```

### Content Chain
```
teachingModules    — id, workspaceId, creatorId, title, fileUrl, extractedText, status, createdAt, deletedAt
teachingMaterials  — id, moduleId, title, content(text), status, createdAt, deletedAt
blueprints         — id, materialId, title, curriculumType, indicators(jsonb), createdAt, deletedAt
```

### Assessment
```
assessments        — id, workspaceId, title, status, createdAt, deletedAt
assessmentBlueprints — assessmentId, blueprintId  (many-to-many)
assessmentItems    — id, assessmentId, question, options(jsonb), correctAnswer, bloomLevel, indicator, order
```

### Classes & Submissions
```
classes            — id, workspaceId, teacherId, name, createdAt
classEnrollments   — classId, studentId, enrolledAt
classModules       — classId, moduleId  (murid bisa akses bahan ajar dari modul ini)
classAssignments   — id, classId, assessmentId, openAt, dueAt
submissions        — id, assignmentId, studentId, answers(jsonb), score, submittedAt, gradedAt
```

### Invariants
- UUID primary keys di semua tabel
- Soft delete (`deletedAt`) pada semua konten
- `auditLog` untuk aksi sensitif
- AI-generated content wajib review guru sebelum dipublish ke murid

---

## 7. UI Layout

**Sidebar tetap** (kiri) + konten utama (kanan).

### Guru Sidebar
```
▦ [Workspace Name]
──────────────────
📚 Modul Ajar
📄 Bahan Ajar
📋 Kisi-kisi
📝 Asesmen
🎓 Kelas
──────────────────
⚙ Settings
```

### Editor Bahan Ajar
Split view: rich-text editor (kiri) + AI chat sidebar (kanan). AI sidebar punya: chat history, input field, dan quick suggestion chips.

---

## 8. Route Structure

### Teacher Portal
```
/                          — redirect ke workspace aktif
/workspaces                — pilih workspace
/workspaces/new            — buat workspace
/invite/[token]            — join workspace
/dashboard                 — overview workspace
/modules                   — list modul ajar
/modules/new               — buat/upload modul
/modules/[id]              — detail modul + list bahan ajar
/modules/[id]/materials/[id] — editor bahan ajar + AI chat
/blueprints                — list kisi-kisi
/blueprints/[id]           — edit kisi-kisi
/assessments               — list asesmen
/assessments/new           — buat asesmen (pilih kisi-kisi)
/assessments/[id]          — preview + edit soal
/classes                   — list kelas
/classes/new               — buat kelas
/classes/[id]              — kelola murid + assignment
/classes/[id]/results      — nilai murid
/settings                  — profil & workspace settings
```

### Student Portal
```
/student                   — dashboard (kelas & tugas aktif)
/student/classes/[id]      — materi kelas
/student/materials/[id]    — baca bahan ajar + AI tutor
/student/assessments/[id]  — kerjakan soal
/student/results/[id]      — nilai + pembahasan
```

### API (AI)
```
POST /api/ai/extract-module      — ekstrak teks dari upload
POST /api/ai/generate-material   — generate bahan ajar dari modul
POST /api/ai/generate-blueprint  — generate kisi-kisi dari bahan ajar
POST /api/ai/generate-assessment — generate soal dari kisi-kisi
POST /api/ai/chat                — SSE stream, chat sidebar guru
POST /api/ai/tutor               — SSE stream, RAG tutor murid
```

---

## 9. Package Structure (Monorepo)

```
@arago/validators  — Zod schemas & enums (role, status, curriculum type)
@arago/db          — Drizzle schema + Supabase client
@arago/ai          — AI pipeline (extract, generate, chat, tutor)
@arago/test-utils  — DB factories untuk testing
apps/web           — Next.js 15 app (guru + murid portal)
```

---

## 10. Fase Implementasi

### Fase 1 — MVP
Auth · Workspace · Upload Modul · Generate Bahan Ajar · Generate Kisi-kisi · Generate Soal PG · Publish Asesmen · Murid kerjakan + auto-nilai

### Fase 2 — AI Chat
Chat sidebar di semua editor · AI suggestion inline · AI tutor murid (RAG) · Template Kurikulum Merdeka & K-13

### Fase 3 — Kelas
Manajemen kelas · Enroll murid · Assign asesmen + due date · Dashboard hasil per kelas · Progress tracking murid

### Fase 4 — Polish
Shortcut mode (jump ahead content chain) · Notifikasi · Export PDF · Analitik workspace

---

## 11. Error Handling & Testing

- AI endpoint gagal: retry 2x, tampilkan error actionable ke guru ("Generate gagal, coba lagi")
- Upload file: validasi tipe (PDF/DOCX) & ukuran (max 10MB) di client + server
- Auth: NextAuth v5 JWT, guard per-role di middleware + server route handlers
- Testing: Vitest unit (AI pipeline, validators) + integration test dengan real DB (`@arago/test-utils`)
- AI content selalu status `draft` — tidak bisa sampai ke murid tanpa publish eksplisit guru
