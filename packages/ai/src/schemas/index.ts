import { z } from "zod";

export const AssessmentItemSchema = z.object({
  itemType: z.enum(["multiple_choice", "short_answer"]),
  prompt: z.string().min(1),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().min(1),
  points: z.number().int().min(1).default(1),
  explanation: z.string().optional(),
});

export const AssessmentOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  items: z.array(AssessmentItemSchema).min(1),
});

export type AssessmentItemOutput = z.infer<typeof AssessmentItemSchema>;
export type AssessmentOutput = z.infer<typeof AssessmentOutputSchema>;