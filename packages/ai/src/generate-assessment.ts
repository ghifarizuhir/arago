import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import {
  GeneratedAssessmentSchema,
  type GeneratedAssessment,
  type Indicator,
} from './schemas/index.js';

async function attempt(
  blueprintTitle: string,
  indicators: Indicator[],
  itemCount: number
): Promise<GeneratedAssessment> {
  const indicatorList = indicators
    .map((ind) => `- [${ind.id}] (${ind.bloomLevel}) ${ind.description}`)
    .join('\n');

  const { object } = await generateObject({
    model: getModel(),
    schema: GeneratedAssessmentSchema,
    prompt: `You are an expert Indonesian K-12 assessment designer.
Create ${itemCount} multiple-choice questions for the assessment below.
Each question must:
- Have exactly 4 options (ids: "A", "B", "C", "D")
- Specify the correct answer id
- Map to one of the provided indicators
- Reflect the Bloom's taxonomy level of that indicator

Blueprint title: ${blueprintTitle}
Indicators:
${indicatorList}`,
  });
  return object;
}

export async function generateAssessment(
  blueprintTitle: string,
  indicators: Indicator[],
  itemCount: number = 10
): Promise<GeneratedAssessment> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(blueprintTitle, indicators, itemCount);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
