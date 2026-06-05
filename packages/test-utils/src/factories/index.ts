import { users, schools, districts, classes, type Database } from "@arago/db";
import type { UserRole } from "@arago/validators";
import { eq } from "drizzle-orm";

export async function seedTestDistrict(db: Database) {
  const [district] = await db
    .insert(districts)
    .values({ name: "Test District" })
    .returning();
  return district;
}

export async function seedTestSchool(db: Database, districtId?: string) {
  const [school] = await db
    .insert(schools)
    .values({ name: "Test School", districtId: districtId ?? null })
    .returning();
  return school;
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
  const [user] = await db
    .insert(users)
    .values({
      email: overrides?.email ?? `test-${crypto.randomUUID()}@example.com`,
      name: overrides?.name ?? "Test User",
      role: overrides?.role ?? "teacher",
      schoolId: overrides?.schoolId ?? null,
      passwordHash: overrides?.passwordHash ?? null,
    })
    .returning();
  return user;
}

export async function seedTestClass(db: Database, teacherId: string, schoolId: string) {
  const [cls] = await db
    .insert(classes)
    .values({
      name: "Test Class",
      teacherId,
      schoolId,
      gradeLevel: 10,
      subject: "Mathematics",
    })
    .returning();
  return cls;
}

export async function cleanupTestData(db: Database) {
  await db.delete(users);
  await db.delete(classes);
  await db.delete(schools);
  await db.delete(districts);
}