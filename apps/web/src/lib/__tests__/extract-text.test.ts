import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }));

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { extractText } from '../extract-text';

describe('extractText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts text from a PDF buffer', async () => {
    vi.mocked(pdf).mockResolvedValue({ text: 'PDF content here' } as any);
    const buffer = Buffer.from('%PDF-1.4 fake pdf content');
    const result = await extractText(buffer, 'application/pdf');
    expect(result).toBe('PDF content here');
    expect(pdf).toHaveBeenCalledWith(buffer);
  });

  it('extracts text from a DOCX buffer', async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: 'DOCX content here', messages: [] });
    const buffer = Buffer.from('PK fake docx content');
    const result = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(result).toBe('DOCX content here');
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('throws for unsupported MIME types', async () => {
    const buffer = Buffer.from('some content');
    await expect(extractText(buffer, 'image/png')).rejects.toThrow('Unsupported MIME type: image/png');
  });
});
