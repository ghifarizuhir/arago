import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

const db = drizzle(client, { schema });

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`Failed to insert ${label}`);
  return row;
}

async function seed() {
  console.log("Seeding database...");

  const district = requireRow(
    (
      await db
        .insert(schema.districts)
        .values({ name: "Springfield Public Schools" })
        .returning()
    )[0],
    "district",
  );
  console.log(`Created district: ${district.name} (${district.id})`);

  const school = requireRow(
    (
      await db
        .insert(schema.schools)
        .values({ name: "Springfield Elementary", districtId: district.id })
        .returning()
    )[0],
    "school",
  );
  console.log(`Created school: ${school.name} (${school.id})`);

  const teacher = requireRow(
    (
      await db
        .insert(schema.users)
        .values({
          email: "teacher@springfield.edu",
          name: "Ms. Frizzle",
          role: "teacher",
          schoolId: school.id,
          passwordHash: "$2a$10$placeholder_hash_teacher",
        })
        .returning()
    )[0],
    "teacher",
  );
  console.log(`Created teacher: ${teacher.name} (${teacher.id})`);

  const student = requireRow(
    (
      await db
        .insert(schema.users)
        .values({
          email: "student@springfield.edu",
          name: "Arnold Perlstein",
          role: "student",
          schoolId: school.id,
          passwordHash: "$2a$10$placeholder_hash_student",
        })
        .returning()
    )[0],
    "student",
  );
  console.log(`Created student: ${student.name} (${student.id})`);

  const admin = requireRow(
    (
      await db
        .insert(schema.users)
        .values({
          email: "admin@springfield.edu",
          name: "Principal Simmons",
          role: "admin",
          schoolId: school.id,
          passwordHash: "$2a$10$placeholder_hash_admin",
        })
        .returning()
    )[0],
    "admin",
  );
  console.log(`Created admin: ${admin.name} (${admin.id})`);

  const classEntity = requireRow(
    (
      await db
        .insert(schema.classes)
        .values({
          name: "4th Grade Math",
          teacherId: teacher.id,
          schoolId: school.id,
          gradeLevel: 4,
          subject: "Mathematics",
        })
        .returning()
    )[0],
    "class",
  );
  console.log(`Created class: ${classEntity.name} (${classEntity.id})`);

  await db.insert(schema.classMemberships).values({
    classId: classEntity.id,
    studentId: student.id,
  });
  console.log("Enrolled student in class.");

  const commonCoreStandards = [
    {
      code: "CCSS.MATH.CONTENT.4.OA.A.1",
      description:
        "Interpret a multiplication equation as a comparison, e.g., interpret 35 = 5 × 7 as a statement that 35 is 5 times as many as 7.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.OA.A.2",
      description:
        "Multiply or divide to solve word problems involving multiplicative comparison.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NBT.A.1",
      description:
        "Recognize that in a multi-digit whole number, a digit in one place represents ten times what it represents in the place to its right.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NBT.A.2",
      description:
        "Read and write multi-digit whole numbers using base-ten numerals, number names, and expanded form.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NBT.B.5",
      description:
        "Multiply a whole number of up to four digits by a one-digit whole number, and multiply two two-digit numbers.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NBT.B.6",
      description:
        "Find whole-number quotients and remainders with up to four-digit dividends and one-digit divisors.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NF.A.1",
      description:
        "Explain why a fraction a/b is equivalent to a fraction (n × a)/(n × b) by using visual fraction models.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.NF.A.2",
      description:
        "Compare two fractions with different numerators and different denominators.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.MD.A.1",
      description:
        "Know relative sizes of measurement units within one system of units.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.MD.A.3",
      description:
        "Apply the area and perimeter formulas for rectangles in real world and mathematical problems.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.G.A.1",
      description:
        "Draw points, lines, line segments, rays, angles, and perpendicular and parallel lines.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
    {
      code: "CCSS.MATH.CONTENT.4.G.A.2",
      description:
        "Classify two-dimensional figures based on the presence or absence of parallel or perpendicular lines.",
      subject: "Mathematics",
      gradeLevel: 4,
      framework: "Common Core",
    },
  ];

  const insertedStandards = await db
    .insert(schema.standards)
    .values(commonCoreStandards)
    .returning();
  console.log(`Inserted ${insertedStandards.length} Common Core standards.`);

  const mcStandard = insertedStandards[0];
  const saStandard = insertedStandards[1];
  if (!mcStandard) throw new Error("Missing MC standard");
  if (!saStandard) throw new Error("Missing SA standard");

  const assessment = requireRow(
    (
      await db
        .insert(schema.assessments)
        .values({
          title: "4th Grade Math — Chapter 1 Quiz",
          description: "Multiplication, division, and place value",
          teacherId: teacher.id,
          classId: classEntity.id,
          status: "draft",
        })
        .returning()
    )[0],
    "assessment",
  );
  console.log(`Created assessment: ${assessment.title} (${assessment.id})`);

  const item1 = requireRow(
    (
      await db
        .insert(schema.assessmentItems)
        .values({
          assessmentId: assessment.id,
          itemType: "multiple_choice",
          prompt:
            "Which equation shows that 35 is 5 times as many as 7?",
          options: {
            choices: [
              "5 × 7 = 35",
              "7 × 5 = 12",
              "35 ÷ 5 = 30",
              "35 + 7 = 42",
            ],
          },
          correctAnswer: "5 × 7 = 35",
          points: 2,
          standardsId: mcStandard.id,
          sortOrder: 1,
        })
        .returning()
    )[0],
    "assessment item 1",
  );

  const item2 = requireRow(
    (
      await db
        .insert(schema.assessmentItems)
        .values({
          assessmentId: assessment.id,
          itemType: "short_answer",
          prompt:
            "A book costs 3 times as much as a pen. If the pen costs $4, how much does the book cost?",
          correctAnswer: "$12",
          points: 3,
          standardsId: saStandard.id,
          sortOrder: 2,
        })
        .returning()
    )[0],
    "assessment item 2",
  );
  console.log(
    `Created assessment items (MC: ${item1.id}, SA: ${item2.id}).`,
  );

  const submission = requireRow(
    (
      await db
        .insert(schema.assessmentSubmissions)
        .values({
          assessmentId: assessment.id,
          studentId: student.id,
          submittedAt: new Date(),
        })
        .returning()
    )[0],
    "submission",
  );

  await db.insert(schema.submissionResponses).values([
    {
      submissionId: submission.id,
      itemId: item1.id,
      responseText: "5 × 7 = 35",
      isCorrect: true,
      pointsEarned: 2,
    },
    {
      submissionId: submission.id,
      itemId: item2.id,
      responseText: "$12",
      isCorrect: true,
      pointsEarned: 3,
    },
  ]);
  console.log("Created submission with responses.");

  await db.insert(schema.auditLog).values({
    userId: teacher.id,
    action: "create_assessment",
    entityType: "assessment",
    entityId: assessment.id,
    metadata: { source: "seed" },
  });

  console.log("Seed complete.");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => client.end());