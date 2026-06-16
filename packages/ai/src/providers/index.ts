import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

type Provider = 'anthropic' | 'openai';

let _provider: Provider = (process.env.AI_PROVIDER as Provider) ?? 'anthropic';

export function setProvider(p: Provider): void {
  _provider = p;
}

export function getModel(): LanguageModelV1 {
  if (_provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai('gpt-4o') as LanguageModelV1;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic('claude-sonnet-4-5') as LanguageModelV1;
}
