import { generateObject } from "ai";
import { getModel } from "./providers";
import { AssessmentOutputSchema } from "./schemas";
import {
  ASSESSMENT_GENERATION_PROMPT,
  MULTIPLE_CHOICE_TEMPLATE,
  SHORT_ANSWER_TEMPLATE,
  MIXED_TEMPLATE,
} from "./prompts";
import type { GenerateAssessmentInput } from "@arago/validators";

const MAX_RETRIES = 2;

interface GenerateAssessmentParams {
  topic: string;
  itemCount?: number;
  itemTypes?: ("multiple_choice" | "short_answer")[];
  difficulty?: "easy" | "medium" | "hard";
  gradeLevel?: number;
  subject?: string;
  standards?: string[];
}

function buildPrompt(params: GenerateAssessmentParams): string {
  const gradeLevel = params.gradeLevel ? ` for grade ${params.gradeLevel}` : "";
  const subject = params.subject ? ` in ${params.subject}` : "";
  const standards = params.standards?.length
    ? ` aligned to standards: ${params.standards.join(", ")}`
    : "";

  const hasMultipleChoice = params.itemTypes?.includes("multiple_choice");
  const hasShortAnswer = params.itemTypes?.includes("short_answer");

  let template: string;
  if (hasMultipleChoice && hasShortAnswer) {
    template = MIXED_TEMPLATE;
  } else if (hasShortAnswer) {
    template = SHORT_ANSWER_TEMPLATE;
  } else {
    template = MULTIPLE_CHOICE_TEMPLATE;
  }

  return (
    template
      .replace("{itemCount}", String(params.itemCount ?? 5))
      .replace("{topic}", params.topic)
      .replace("{difficulty}", params.difficulty ?? "medium")
      .replace("{gradeLevel}", gradeLevel)
      .replace("{subject}", subject)
      .replace("{standards}", standards)
  );
}

export async function generateAssessment(
  params: GenerateAssessmentParams
): Promise<z.infer<typeof AssessmentOutputSchema>> {
  const model = getModel();
  const prompt = buildPrompt(params);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateObject({
        model,
        schema: AssessmentOutputSchema,
        system: ASSESSMENT_GENERATION_PROMPT,
        prompt,
      });

      return result.object;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        continue;
      }
    }
  }

  throw new Error(
    `Assessment generation failed after ${MAX_RETRIES + 1} attempts: ${lastError instanceof Error ? lastError.message : "Unknown error"}`
  );
}

export { AssessmentItemSchema, AssessmentOutputSchema };