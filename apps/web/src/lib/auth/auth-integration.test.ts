import { describe, it, expect, afterEach } from "vitest";
import { db } from "@arago/db/client";
import { users } from "@arago/db/schema";
import { hashPassword, authenticateUser } from "@/lib/auth/password";
import { seedTestUser, seedTestSchool, seedTestDistrict, cleanupTestData } from "@arago/test-utils";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Registration database operations (requires DB)", () => {
  afterEach(async () => {
    await cleanupTestData(db);
  });

  it("should insert a user with hashed password", async () => {
    const passwordHash = await hashPassword("securePassword123");

    const result = await db
      .insert(users)
      .values({
        name: "Test Teacher",
        email: "reg-test@arago.dev",
        role: "teacher",
        passwordHash,
      })
      .returning();

    const inserted = result[0];
    expect(inserted).toBeDefined();
    expect(inserted!.email).toBe("reg-test@arago.dev");
    expect(inserted!.role).toBe("teacher");
    expect(inserted!.passwordHash).toBeDefined();
    expect(inserted!.passwordHash).not.toBe("securePassword123");
  });

  it("should prevent duplicate email registration", async () => {
    const passwordHash = await hashPassword("securePassword123");

    await db.insert(users).values({
      name: "First User",
      email: "duplicate@arago.dev",
      role: "teacher",
      passwordHash,
    });

    await expect(
      db.insert(users).values({
        name: "Second User",
        email: "duplicate@arago.dev",
        role: "student",
        passwordHash,
      })
    ).rejects.toThrow();
  });

  it("should register student with school association", async () => {
    const district = await seedTestDistrict(db);
    const school = await seedTestSchool(db, district.id);
    const passwordHash = await hashPassword("securePassword123");

    const result = await db
      .insert(users)
      .values({
        name: "Test Student",
        email: "student-school@arago.dev",
        role: "student",
        schoolId: school.id,
        passwordHash,
      })
      .returning();

    expect(result[0]!.schoolId).toBe(school.id);
  });

  it("should authenticate a registered user end-to-end", async () => {
    const passwordHash = await hashPassword("securePassword123");

    await db.insert(users).values({
      name: "Auth Test User",
      email: "auth-reg-test@arago.dev",
      role: "teacher",
      passwordHash,
    });

    const authResult = await authenticateUser("auth-reg-test@arago.dev", "securePassword123");
    expect(authResult).not.toBeNull();
    expect(authResult!.email).toBe("auth-reg-test@arago.dev");
    expect(authResult!.role).toBe("teacher");
  });
});