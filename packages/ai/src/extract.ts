import { generateObject } from 'ai';
import { getModel } from './providers/index.js';
import { ExtractedModuleSchema, type ExtractedModule } from './schemas/index.js';

async function attempt(text: string): Promise<ExtractedModule> {
  const { object } = await generateObject({
    model: getModel(),
    schema: ExtractedModuleSchema,
    prompt: `You are an expert Indonesian K-12 curriculum analyst.
Analyze the following teaching module text and extract:
1. A concise summary (2-3 sentences) in Indonesian
2. A list of main topics covered

Teaching module text:
${text}`,
  });
  return object;
}

export async function extractModuleContent(text: string): Promise<ExtractedModule> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await attempt(text);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
