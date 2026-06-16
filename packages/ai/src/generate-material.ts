import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { GeneratedMaterialSchema, type GeneratedMaterial } from './schemas/index.js';

async function attempt(
  moduleTitle: string,
  extractedText: string,
  topic?: string
): Promise<GeneratedMaterial> {
  const topicClause = topic ? `Focus specifically on the topic: "${topic}".` : '';
  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedMaterialSchema,
    prompt: `You are an expert Indonesian K-12 curriculum designer.
Create a comprehensive teaching material (Bahan Ajar) based on the module below.
${topicClause}
Output the content as valid HTML (use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em> tags).
The content should be structured, educational, and appropriate for Indonesian K-12 students.

Module title: ${moduleTitle}
Module content:
${extractedText}`,
  });
  return object;
}

export async function generateMaterial(
  moduleTitle: string,
  extractedText: string,
  topic?: string
): Promise<GeneratedMaterial> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(moduleTitle, extractedText, topic);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
