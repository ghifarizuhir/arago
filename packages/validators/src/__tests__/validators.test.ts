import { describe, it, expect } from "vitest";
import {
  UserRole,
  LoginSchema,
  RegisterSchema,
  CreateUserSchema,
  UpdateUserSchema,
} from "../index";

describe("UserRole", () => {
  it("accepts valid roles", () => {
    expect(UserRole.Values.teacher).toBe("teacher");
    expect(UserRole.Values.student).toBe("student");
    expect(UserRole.Values.admin).toBe("admin");
  });

  it("parses valid role strings", () => {
    expect(UserRole.parse("teacher")).toBe("teacher");
    expect(UserRole.parse("student")).toBe("student");
    expect(UserRole.parse("admin")).toBe("admin");
  });

  it("rejects invalid roles", () => {
    expect(() => UserRole.parse("superadmin")).toThrow();
  });
});

describe("LoginSchema", () => {
  it("validates correct input", () => {
    const result = LoginSchema.safeParse({
      email: "teacher@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = LoginSchema.safeParse({
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = LoginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = LoginSchema.safeParse({
      email: "teacher@example.com",
      password: "pass",
    });
    expect(result.success).toBe(false);
  });
});

describe("RegisterSchema", () => {
  it("validates correct input", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Teacher",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
      role: "teacher",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Teacher",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "different",
      role: "teacher",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("rejects short name", () => {
    const result = RegisterSchema.safeParse({
      name: "J",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
      role: "teacher",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Teacher",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional schoolId", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Teacher",
      email: "jane@example.com",
      password: "password123",
      confirmPassword: "password123",
      role: "teacher",
      schoolId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateUserSchema", () => {
  it("validates correct input", () => {
    const result = CreateUserSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      role: "teacher",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = CreateUserSchema.safeParse({
      name: "Test User",
      email: "bad-email",
      role: "student",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional schoolId", () => {
    const result = CreateUserSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      role: "admin",
      schoolId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateUserSchema", () => {
  it("allows partial updates", () => {
    const result = UpdateUserSchema.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("allows setting isActive", () => {
    const result = UpdateUserSchema.safeParse({
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it("allows setting schoolId to null", () => {
    const result = UpdateUserSchema.safeParse({
      schoolId: null,
    });
    expect(result.success).toBe(true);
  });
});