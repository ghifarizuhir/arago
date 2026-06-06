import { users, schools, districts, classes } from "@arago/db/schema";
import type { Database } from "@arago/db/client";
import type { UserRole } from "@arago/validators";

export async function seedTestDistrict(db: Database) {
  const rows = await db.insert(districts).values({ name: "Test District" }).returning();
  return rows[0]!;
}

export async function seedTestSchool(db: Database, districtId?: string) {
  const rows = await db
    .insert(schools)
    .values({ name: "Test School", districtId: districtId ?? null })
    .returning();
  return rows[0]!;
}

export async function seedTestUser(
  db: Database,
  overrides?: {
    email?: string;
    name?: string;
    role?: UserRole;
    schoolId?: string | null;
    passwordHash?: string;
  }
) {
  const rows = await db
    .insert(users)
    .values({
      email: overrides?.email ?? `test-${crypto.randomUUID()}@example.com`,
      name: overrides?.name ?? "Test User",
      role: overrides?.role ?? "teacher",
      schoolId: overrides?.schoolId ?? null,
      passwordHash: overrides?.passwordHash ?? null!,
    })
    .returning();
  return rows[0]!;
}

export async function seedTestClass(db: Database, teacherId: string, schoolId: string) {
  const rows = await db
    .insert(classes)
    .values({
      name: "Test Class",
      teacherId,
      schoolId,
      gradeLevel: 10,
      subject: "Mathematics",
    })
    .returning();
  return rows[0]!;
}

export async function seedTestDatabase(db: Database) {
  const district = await seedTestDistrict(db);
  const school = await seedTestSchool(db, district.id);
  return { district, school };
}

export async function cleanupTestData(db: Database) {
  await db.delete(users);
  await db.delete(classes);
  await db.delete(schools);
  await db.delete(districts);
}

export const TEST_CONSTANTS = {
  TEST_EMAIL: "test@arago.dev",
  TEST_PASSWORD: "testPassword123!",
  TEST_SCHOOL_NAME: "Arago Test School",
  TEST_DISTRICT_NAME: "Arago Test District",
} as const;