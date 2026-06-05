import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["teacher", "student", "admin"]);

export const districts = pgTable("districts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schools = pgTable("schools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  districtId: uuid("district_id").references(() => districts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull(),
  schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  isActive: boolean("is_active").default(true).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const classes = pgTable("classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  teacherId: uuid("teacher_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  schoolId: uuid("school_id")
    .references(() => schools.id, { onDelete: "cascade" })
    .notNull(),
  gradeLevel: integer("grade_level"),
  subject: varchar("subject", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const classMemberships = pgTable("class_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id")
    .references(() => classes.id, { onDelete: "cascade" })
    .notNull(),
  studentId: uuid("student_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
});

export const standards = pgTable("standards", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull(),
  description: text("description").notNull(),
  subject: varchar("subject", { length: 100 }),
  gradeLevel: integer("grade_level"),
  framework: varchar("framework", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assessmentStatusEnum = pgEnum("assessment_status", [
  "draft",
  "published",
  "archived",
]);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  teacherId: uuid("teacher_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
  status: assessmentStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const itemTypeEnum = pgEnum("item_type", ["multiple_choice", "short_answer"]);

export const assessmentItems = pgTable("assessment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentId: uuid("assessment_id")
    .references(() => assessments.id, { onDelete: "cascade" })
    .notNull(),
  itemType: itemTypeEnum("item_type").notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options"),
  correctAnswer: text("correct_answer"),
  points: integer("points").default(1),
  standardsId: uuid("standards_id").references(() => standards.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assessmentSubmissions = pgTable("assessment_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentId: uuid("assessment_id")
    .references(() => assessments.id, { onDelete: "cascade" })
    .notNull(),
  studentId: uuid("student_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  totalScore: integer("total_score"),
});

export const submissionResponses = pgTable("submission_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => assessmentSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  itemId: uuid("item_id")
    .references(() => assessmentItems.id, { onDelete: "cascade" })
    .notNull(),
  responseText: text("response_text"),
  isCorrect: boolean("is_correct"),
  pointsEarned: integer("points_earned"),
  aiFeedback: text("ai_feedback"),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---- Relations ----

export const districtsRelations = relations(districts, ({ many }) => ({
  schools: many(schools),
}));

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  district: one(districts, { fields: [schools.districtId], references: [districts.id] }),
  users: many(users),
  classes: many(classes),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  school: one(schools, { fields: [users.schoolId], references: [schools.id] }),
  taughtClasses: many(classes),
  classMemberships: many(classMemberships),
  assessments: many(assessments),
  submissions: many(assessmentSubmissions),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(users, { fields: [classes.teacherId], references: [users.id] }),
  school: one(schools, { fields: [classes.schoolId], references: [schools.id] }),
  memberships: many(classMemberships),
  assessments: many(assessments),
}));

export const classMembershipsRelations = relations(classMemberships, ({ one }) => ({
  class: one(classes, { fields: [classMemberships.classId], references: [classes.id] }),
  student: one(users, { fields: [classMemberships.studentId], references: [users.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  teacher: one(users, { fields: [assessments.teacherId], references: [users.id] }),
  class: one(classes, { fields: [assessments.classId], references: [classes.id] }),
  items: many(assessmentItems),
  submissions: many(assessmentSubmissions),
}));

export const assessmentItemsRelations = relations(assessmentItems, ({ one }) => ({
  assessment: one(assessments, { fields: [assessmentItems.assessmentId], references: [assessments.id] }),
  standard: one(standards, { fields: [assessmentItems.standardsId], references: [standards.id] }),
}));

export const assessmentSubmissionsRelations = relations(assessmentSubmissions, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentSubmissions.assessmentId],
    references: [assessments.id],
  }),
  student: one(users, { fields: [assessmentSubmissions.studentId], references: [users.id] }),
  responses: many(submissionResponses),
}));

export const submissionResponsesRelations = relations(submissionResponses, ({ one }) => ({
  submission: one(assessmentSubmissions, {
    fields: [submissionResponses.submissionId],
    references: [assessmentSubmissions.id],
  }),
  item: one(assessmentItems, {
    fields: [submissionResponses.itemId],
    references: [assessmentItems.id],
  }),
}));