import { describe, it, expect, afterEach } from "vitest";
import { RegisterSchema } from "@arago/validators";

describe("RegisterSchema validation", () => {
  it("should validate a correct registration payload", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Teacher",
      email: "teacher@arago.dev",
      password: "securePassword123",
      confirmPassword: "securePassword123",
      role: "teacher",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing name", () => {
    const result = RegisterSchema.safeParse({
      email: "teacher@arago.dev",
      password: "securePassword123",
      confirmPassword: "securePassword123",
      role: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid email", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Teacher",
      email: "not-an-email",
      password: "securePassword123",
      confirmPassword: "securePassword123",
      role: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short password", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Teacher",
      email: "teacher@arago.dev",
      password: "short",
      confirmPassword: "short",
      role: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("should reject mismatched passwords", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Teacher",
      email: "teacher@arago.dev",
      password: "securePassword123",
      confirmPassword: "differentPassword",
      role: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid role", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Hacker",
      email: "hacker@arago.dev",
      password: "securePassword123",
      confirmPassword: "securePassword123",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid roles", () => {
    for (const role of ["teacher", "student", "admin"] as const) {
      const result = RegisterSchema.safeParse({
        name: "Test User",
        email: `${role}@arago.dev`,
        password: "securePassword123",
        confirmPassword: "securePassword123",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should accept optional schoolId", () => {
    const result = RegisterSchema.safeParse({
      name: "Test Teacher",
      email: "teacher@arago.dev",
      password: "securePassword123",
      confirmPassword: "securePassword123",
      role: "teacher",
      schoolId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});