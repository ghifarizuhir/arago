import { describe, it, expect } from "vitest";
import {
  WorkspaceMemberRole,
  ContentStatus,
  CurriculumType,
  BloomLevel,
  RegisterSchema,
  LoginSchema,
  CreateWorkspaceSchema,
  CreateModuleSchema,
  CreateMaterialSchema,
  CreateBlueprintSchema,
  CreateAssessmentSchema,
  CreateClassSchema,
  EnrollStudentsSchema,
  AssignMaterialsSchema
} from "./index.js";

describe("WorkspaceMemberRole", () => {
  it("has owner, teacher, student values", () => {
    expect(WorkspaceMemberRole.owner).toBe("owner");
    expect(WorkspaceMemberRole.teacher).toBe("teacher");
    expect(WorkspaceMemberRole.student).toBe("student");
    expect(Object.keys(WorkspaceMemberRole)).toHaveLength(3);
  });
});

describe("ContentStatus", () => {
  it("has draft and published values", () => {
    expect(ContentStatus.draft).toBe("draft");
    expect(ContentStatus.published).toBe("published");
    expect(Object.keys(ContentStatus)).toHaveLength(2);
  });
});

describe("CurriculumType", () => {
  it("has merdeka, k13, custom values", () => {
    expect(CurriculumType.merdeka).toBe("merdeka");
    expect(CurriculumType.k13).toBe("k13");
    expect(CurriculumType.custom).toBe("custom");
    expect(Object.keys(CurriculumType)).toHaveLength(3);
  });
});

describe("BloomLevel", () => {
  it("has C1 through C6", () => {
    const levels = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
    levels.forEach((l) => expect(BloomLevel[l]).toBe(l));
    expect(Object.keys(BloomLevel)).toHaveLength(6);
  });
});

describe("RegisterSchema", () => {
  it("accepts valid registration data", () => {
    const result = RegisterSchema.safeParse({
      name: "Budi Santoso",
      email: "budi@sekolah.id",
      password: "SecurePass123!"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = RegisterSchema.safeParse({
      email: "budi@sekolah.id",
      password: "SecurePass123!"
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password (< 8 chars)", () => {
    const result = RegisterSchema.safeParse({
      name: "Budi",
      email: "budi@sekolah.id",
      password: "abc"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("password");
    }
  });

  it("rejects invalid email", () => {
    const result = RegisterSchema.safeParse({
      name: "Budi",
      email: "not-an-email",
      password: "SecurePass123!"
    });
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = LoginSchema.safeParse({
      email: "guru@arago.id",
      password: "mypassword"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email: "guru@arago.id",
      password: ""
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateWorkspaceSchema", () => {
  it("accepts valid workspace", () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: "SMA Negeri 1 Jakarta",
      slug: "sman1-jakarta"
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with spaces", () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: "My School",
      slug: "my school"
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug with uppercase", () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: "My School",
      slug: "MySchool"
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug longer than 100 chars", () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: "My School",
      slug: "a".repeat(101)
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateModuleSchema", () => {
  it("accepts module with title only", () => {
    const result = CreateModuleSchema.safeParse({
      title: "Bab 1: Sistem Persamaan Linear"
    });
    expect(result.success).toBe(true);
  });

  it("accepts module with optional fileUrl", () => {
    const result = CreateModuleSchema.safeParse({
      title: "Bab 1",
      fileUrl: "https://storage.supabase.co/bucket/file.pdf"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = CreateModuleSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 500 chars", () => {
    const result = CreateModuleSchema.safeParse({ title: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe("CreateMaterialSchema", () => {
  it("accepts valid material", () => {
    const result = CreateMaterialSchema.safeParse({
      moduleId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Pengertian SPLTV",
      content: "<p>Materi lengkap...</p>"
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID moduleId", () => {
    const result = CreateMaterialSchema.safeParse({
      moduleId: "not-a-uuid",
      title: "Material",
      content: "Content"
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = CreateMaterialSchema.safeParse({
      moduleId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Material",
      content: ""
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateBlueprintSchema", () => {
  it("accepts valid blueprint with indicators", () => {
    const result = CreateBlueprintSchema.safeParse({
      materialId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Kisi-kisi Ulangan Harian",
      curriculumType: "merdeka",
      indicators: [
        { code: "3.1", description: "Siswa dapat menjelaskan konsep SPLTV" }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid curriculumType", () => {
    const result = CreateBlueprintSchema.safeParse({
      materialId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Blueprint",
      curriculumType: "cambridge",
      indicators: []
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty indicators array", () => {
    const result = CreateBlueprintSchema.safeParse({
      materialId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Blueprint",
      curriculumType: "k13",
      indicators: []
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateAssessmentSchema", () => {
  it("accepts valid assessment", () => {
    const result = CreateAssessmentSchema.safeParse({
      title: "Ulangan Harian Bab 1",
      blueprintIds: ["550e8400-e29b-41d4-a716-446655440000"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty blueprintIds", () => {
    const result = CreateAssessmentSchema.safeParse({
      title: "Ulangan Harian",
      blueprintIds: []
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID in blueprintIds", () => {
    const result = CreateAssessmentSchema.safeParse({
      title: "Ulangan Harian",
      blueprintIds: ["not-a-uuid"]
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateClassSchema", () => {
  it("accepts a valid name", () => {
    expect(CreateClassSchema.safeParse({ name: "Kelas 7A" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(CreateClassSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("EnrollStudentsSchema", () => {
  it("accepts an array of uuids", () => {
    expect(
      EnrollStudentsSchema.safeParse({
        studentIds: ["11111111-1111-1111-1111-111111111111"],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty array", () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: [] }).success).toBe(false);
  });
  it("rejects non-uuid entries", () => {
    expect(EnrollStudentsSchema.safeParse({ studentIds: ["nope"] }).success).toBe(false);
  });
});

describe("AssignMaterialsSchema", () => {
  it("accepts an array of uuids", () => {
    expect(
      AssignMaterialsSchema.safeParse({
        materialIds: ["22222222-2222-2222-2222-222222222222"],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty array", () => {
    expect(AssignMaterialsSchema.safeParse({ materialIds: [] }).success).toBe(false);
  });
});
