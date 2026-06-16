export type CurriculumType = 'merdeka' | 'k13' | 'custom';

const MERDEKA = `Kerangka: Kurikulum Merdeka.
- Petakan indikator ke Capaian Pembelajaran (CP) sesuai Fase (A–F) yang relevan dengan jenjang materi.
- Rumuskan sebagai Tujuan Pembelajaran yang operasional.
- Pertimbangkan dimensi Profil Pelajar Pancasila bila relevan.
- Gunakan istilah "kompetensi" pada field competency yang merujuk pada CP/Tujuan Pembelajaran.`;

const K13 = `Kerangka: Kurikulum 2013 (K-13).
- Petakan indikator ke Kompetensi Inti (KI) dan Kompetensi Dasar (KD) yang relevan.
- Field competency harus merujuk pada KD (mis. "KD 3.x ...").
- Indikator adalah Indikator Pencapaian Kompetensi (IPK) yang menjabarkan KD.`;

export function curriculumTemplate(type: CurriculumType): string {
  if (type === 'merdeka') return MERDEKA;
  if (type === 'k13') return K13;
  return '';
}
