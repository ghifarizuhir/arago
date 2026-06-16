import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const WorkspaceMemberRole = {
  owner: "owner",
  teacher: "teacher",
  student: "student"
} as const;
export type WorkspaceMemberRole =
  (typeof WorkspaceMemberRole)[keyof typeof WorkspaceMemberRole];

export const ContentStatus = {
  draft: "draft",
  published: "published"
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

export const CurriculumType = {
  merdeka: "merdeka",
  k13: "k13",
  custom: "custom"
} as const;
export type CurriculumType = (typeof CurriculumType)[keyof typeof CurriculumType];

export const BloomLevel = {
  C1: "C1",
  C2: "C2",
  C3: "C3",
  C4: "C4",
  C5: "C5",
  C6: "C6"
} as const;
export type BloomLevel = (typeof BloomLevel)[keyof typeof BloomLevel];

// ─── Shared primitives ────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Must be a valid UUID");

const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(100, "Slug must be 100 characters or fewer")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens only"
  );

// ─── Auth schemas ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or fewer"),
  email: z.string().email("Invalid email address").max(320),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be 128 characters or fewer")
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Workspace schemas ────────────────────────────────────────────────────────

export const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(255, "Name must be 255 characters or fewer"),
  slug: slugSchema
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

// ─── Content chain schemas ────────────────────────────────────────────────────

export const CreateModuleSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or fewer"),
  fileUrl: z.string().url("Must be a valid URL").optional()
});
export type CreateModuleInput = z.infer<typeof CreateModuleSchema>;

export const CreateMaterialSchema = z.object({
  moduleId: uuidSchema,
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or fewer"),
  content: z.string().min(1, "Content is required")
});
export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;

const IndicatorSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1)
});

export const CreateBlueprintSchema = z.object({
  materialId: uuidSchema,
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or fewer"),
  curriculumType: z.enum(["merdeka", "k13", "custom"], {
    errorMap: () => ({ message: "Invalid curriculum type" })
  }),
  indicators: z.array(IndicatorSchema)
});
export type CreateBlueprintInput = z.infer<typeof CreateBlueprintSchema>;

// ─── Assessment schemas ───────────────────────────────────────────────────────

export const CreateAssessmentSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or fewer"),
  blueprintIds: z
    .array(uuidSchema)
    .min(1, "At least one blueprint is required")
});
export type CreateAssessmentInput = z.infer<typeof CreateAssessmentSchema>;
