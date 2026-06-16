import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { GeneratedBlueprintSchema, type GeneratedBlueprint } from './schemas/index.js';
import { curriculumTemplate, type CurriculumType } from './templates/curriculum.js';

async function attempt(
  materialTitle: string,
  content: string,
  curriculumType: string
): Promise<GeneratedBlueprint> {
  const guidance = curriculumTemplate(curriculumType as CurriculumType);
  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedBlueprintSchema,
    prompt: `You are an expert Indonesian K-12 assessment designer.
Create an assessment blueprint (Kisi-kisi) for the teaching material below.
Curriculum type: ${curriculumType}
${guidance ? `\n${guidance}\n` : ''}
Generate 5-8 indicators covering a range of Bloom's taxonomy levels (C1 through C6).
Each indicator must have a unique id (e.g. "IND-001"), a clear description of what students can do,
the Bloom level (C1, C2, C3, C4, C5, or C6), and the core competency it maps to.

Material title: ${materialTitle}
Material content:
${content}`,
  });
  return object;
}

export async function generateBlueprint(
  materialTitle: string,
  content: string,
  curriculumType: string
): Promise<GeneratedBlueprint> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(materialTitle, content, curriculumType);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
