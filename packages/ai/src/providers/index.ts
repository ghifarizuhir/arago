import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";

export type AIProvider = "openai" | "anthropic";

let activeProvider: AIProvider = (process.env.AI_PROVIDER as AIProvider) || "openai";

export function setProvider(provider: AIProvider): void {
  activeProvider = provider;
}

export function getProvider(): AIProvider {
  return activeProvider;
}

export function getModel(): LanguageModelV1 {
  switch (activeProvider) {
    case "openai": {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai("gpt-4o-mini");
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return anthropic("claude-sonnet-4-20250514");
    }
    default:
      throw new Error(`Unknown AI provider: ${activeProvider}`);
  }
}