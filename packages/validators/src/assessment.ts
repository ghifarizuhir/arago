import { z } from "zod";

export const AssessmentStatus = z.enum(["draft", "published", "archived"]);

export const ItemType = z.enum(["multiple_choice", "short_answer"]);

export const CreateAssessmentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  classId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        itemType: ItemType,
        prompt: z.string().min(1),
        options: z.array(z.string()).optional(),
        correctAnswer: z.string().optional(),
        points: z.number().int().min(0).default(1),
        standardsId: z.string().uuid().optional(),
      })
    )
    .min(1, "Assessment must have at least one item"),
});

export const GenerateAssessmentSchema = z.object({
  topic: z.string().min(1).max(500),
  standards: z.array(z.string()).optional(),
  itemCount: z.number().int().min(1).max(20).default(5),
  itemTypes: z.array(ItemType).min(1).default(["multiple_choice"]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  gradeLevel: z.number().int().min(1).max(12).optional(),
  subject: z.string().optional(),
});

export type CreateAssessmentInput = z.infer<typeof CreateAssessmentSchema>;
export type GenerateAssessmentInput = z.infer<typeof GenerateAssessmentSchema>;