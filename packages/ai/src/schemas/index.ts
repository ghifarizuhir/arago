import { z } from 'zod';

export const ExtractedModuleSchema = z.object({
  summary: z.string().describe('Concise summary of the teaching module content'),
  topics: z.array(z.string()).describe('List of main topics covered in the module'),
});

export const GeneratedMaterialSchema = z.object({
  title: z.string().describe('Title of the teaching material'),
  content: z.string().describe('HTML content suitable for rendering in Tiptap editor'),
});

export const GeneratedBlueprintSchema = z.object({
  title: z.string().describe('Title of the assessment blueprint'),
  indicators: z.array(
    z.object({
      id: z.string().describe('Unique identifier for this indicator'),
      description: z.string().describe('What students should be able to do'),
      bloomLevel: z.string().describe('Bloom taxonomy level: C1, C2, C3, C4, C5, or C6'),
      competency: z.string().describe('Core competency this indicator maps to'),
    })
  ),
});

export const GeneratedAssessmentSchema = z.object({
  items: z.array(
    z.object({
      question: z.string().describe('The question text'),
      options: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
        })
      ).length(4).describe('Exactly 4 answer options'),
      correctAnswer: z.string().describe('The id of the correct option'),
      bloomLevel: z.string().describe('Bloom taxonomy level for this question'),
      indicator: z.string().describe('The indicator id this question addresses'),
    })
  ),
});

export type ExtractedModule = z.infer<typeof ExtractedModuleSchema>;
export type GeneratedMaterial = z.infer<typeof GeneratedMaterialSchema>;
export type GeneratedBlueprint = z.infer<typeof GeneratedBlueprintSchema>;
export type GeneratedAssessment = z.infer<typeof GeneratedAssessmentSchema>;
export type Indicator = GeneratedBlueprint['indicators'][number];
