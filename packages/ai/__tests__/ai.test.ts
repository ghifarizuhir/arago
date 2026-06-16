import { describe, it, expect, vi } from 'vitest';
import { MockLanguageModelV1 } from 'ai/test';
import { extractModuleContent } from '../src/extract.js';
import { generateMaterial } from '../src/generate-material.js';
import { generateBlueprint } from '../src/generate-blueprint.js';
import { generateAssessment } from '../src/generate-assessment.js';
import { buildMaterialChatSystemPrompt } from '../src/chat.js';
import { curriculumTemplate } from '../src/templates/curriculum.js';
import * as providers from '../src/providers/index.js';

function makeMockModel(responseObject: unknown): MockLanguageModelV1 {
  return new MockLanguageModelV1({
    defaultObjectGenerationMode: 'json',
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20 },
      text: JSON.stringify(responseObject),
    }),
  });
}

describe('@arago/ai', () => {
  describe('extractModuleContent', () => {
    it('returns summary and topics from model response', async () => {
      const mockResponse = {
        summary: 'Modul ini membahas persamaan linear.',
        topics: ['Persamaan linear satu variabel', 'Penyelesaian persamaan'],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await extractModuleContent('Matematika kelas 7: persamaan linear...');
      expect(result.summary).toBe('Modul ini membahas persamaan linear.');
      expect(result.topics).toHaveLength(2);
      expect(result.topics[0]).toBe('Persamaan linear satu variabel');
    });

    it('retries on failure and eventually throws after 3 attempts', async () => {
      let callCount = 0;
      const failModel = new MockLanguageModelV1({
        defaultObjectGenerationMode: 'json',
        doGenerate: async () => {
          callCount++;
          throw new Error('Model unavailable');
        },
      });
      vi.spyOn(providers, 'getModel').mockReturnValue(failModel as any);

      await expect(extractModuleContent('some text')).rejects.toThrow('Model unavailable');
      expect(callCount).toBe(3);
    });
  });

  describe('generateMaterial', () => {
    it('returns title and HTML content', async () => {
      const mockResponse = {
        title: 'Bahan Ajar: Persamaan Linear',
        content: '<h2>Pengertian</h2><p>Persamaan linear adalah...</p>',
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateMaterial(
        'Matematika Kelas 7',
        'Materi tentang persamaan linear satu variabel',
        'Persamaan linear'
      );
      expect(result.title).toBe('Bahan Ajar: Persamaan Linear');
      expect(result.content).toContain('<h2>');
    });

    it('works without optional topic parameter', async () => {
      const mockResponse = { title: 'Bahan Ajar Lengkap', content: '<p>Konten lengkap...</p>' };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateMaterial('Modul Fisika', 'Teks fisika...');
      expect(result.title).toBeTruthy();
      expect(result.content).toBeTruthy();
    });
  });

  describe('generateBlueprint', () => {
    it('returns blueprint with indicators', async () => {
      const mockResponse = {
        title: 'Kisi-kisi Asesmen Persamaan Linear',
        indicators: [
          { id: 'IND-001', description: 'Siswa dapat menyebutkan definisi', bloomLevel: 'C1', competency: 'Pengetahuan' },
          { id: 'IND-002', description: 'Siswa dapat menjelaskan konsep', bloomLevel: 'C2', competency: 'Pemahaman' },
        ],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const result = await generateBlueprint('Bahan Ajar Persamaan Linear', '<h2>X</h2>', 'merdeka');
      expect(result.indicators).toHaveLength(2);
      expect(result.indicators[0].id).toBe('IND-001');
      expect(result.indicators[0].bloomLevel).toBe('C1');
    });
  });

  describe('generateAssessment', () => {
    it('returns assessment items with 4 options each', async () => {
      const mockResponse = {
        items: [
          {
            question: 'Apa yang dimaksud dengan persamaan linear?',
            options: [
              { id: 'A', text: 'Persamaan dengan pangkat dua' },
              { id: 'B', text: 'Persamaan dengan satu variabel berpangkat satu' },
              { id: 'C', text: 'Persamaan dengan dua variabel' },
              { id: 'D', text: 'Persamaan eksponensial' },
            ],
            correctAnswer: 'B',
            bloomLevel: 'C1',
            indicator: 'IND-001',
          },
        ],
      };
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel(mockResponse) as any);

      const indicators = [
        { id: 'IND-001', description: 'desc', bloomLevel: 'C1', competency: 'Pengetahuan' },
      ];
      const result = await generateAssessment('Kisi-kisi Persamaan Linear', indicators, 1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].options).toHaveLength(4);
      expect(result.items[0].correctAnswer).toBe('B');
    });

    it('defaults to 10 items when itemCount not provided', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        question: `Soal ${i + 1}`,
        options: [
          { id: 'A', text: 'Opsi A' },
          { id: 'B', text: 'Opsi B' },
          { id: 'C', text: 'Opsi C' },
          { id: 'D', text: 'Opsi D' },
        ],
        correctAnswer: 'A',
        bloomLevel: 'C2',
        indicator: 'IND-001',
      }));
      vi.spyOn(providers, 'getModel').mockReturnValue(makeMockModel({ items }) as any);

      const result = await generateAssessment('Kisi-kisi', [
        { id: 'IND-001', description: 'desc', bloomLevel: 'C2', competency: 'comp' },
      ]);
      expect(result.items).toHaveLength(10);
    });
  });

  describe('buildMaterialChatSystemPrompt', () => {
    it('embeds the material content and the apply-fence instruction', () => {
      const prompt = buildMaterialChatSystemPrompt('<h2>Sel Tumbuhan</h2><p>Dinding sel...</p>');
      expect(prompt).toContain('<h2>Sel Tumbuhan</h2>');
      expect(prompt).toContain('```html');
      expect(prompt.toLowerCase()).toContain('bahasa indonesia');
    });

    it('handles empty material content without throwing', () => {
      expect(() => buildMaterialChatSystemPrompt('')).not.toThrow();
    });
  });

  describe('curriculumTemplate', () => {
    it('merdeka mentions Capaian Pembelajaran and Fase', () => {
      const t = curriculumTemplate('merdeka');
      expect(t).toContain('Capaian Pembelajaran');
      expect(t).toContain('Fase');
    });

    it('k13 mentions Kompetensi Inti and Kompetensi Dasar', () => {
      const t = curriculumTemplate('k13');
      expect(t).toContain('Kompetensi Inti');
      expect(t).toContain('Kompetensi Dasar');
    });

    it('custom returns an empty guidance string', () => {
      expect(curriculumTemplate('custom')).toBe('');
    });
  });
});
