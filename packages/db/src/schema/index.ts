import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "teacher",
  "student"
]);

export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "published"
]);

export const curriculumTypeEnum = pgEnum("curriculum_type", [
  "merdeka",
  "k13",
  "custom"
]);

// ─── Identity ─────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  inviteToken: text("invite_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: workspaceMemberRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]
);

// ─── Content chain ────────────────────────────────────────────────────────────

export const teachingModules = pgTable("teaching_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 500 }).notNull(),
  fileUrl: text("file_url"),
  extractedText: text("extracted_text"),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const teachingMaterials = pgTable("teaching_materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => teachingModules.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const blueprints = pgTable("blueprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  materialId: uuid("material_id")
    .notNull()
    .references(() => teachingMaterials.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 500 }).notNull(),
  curriculumType: curriculumTypeEnum("curriculum_type").notNull(),
  indicators: jsonb("indicators").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

// ─── Assessment ───────────────────────────────────────────────────────────────

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 500 }).notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

export const assessmentBlueprints = pgTable(
  "assessment_blueprints",
  {
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    blueprintId: uuid("blueprint_id")
      .notNull()
      .references(() => blueprints.id)
  },
  (t) => [primaryKey({ columns: [t.assessmentId, t.blueprintId] })]
);

export const assessmentItems = pgTable("assessment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id),
  question: text("question").notNull(),
  options: jsonb("options").notNull().default([]),
  correctAnswer: varchar("correct_answer", { length: 50 }).notNull(),
  bloomLevel: varchar("bloom_level", { length: 50 }),
  indicatorRef: text("indicator_ref"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

// ─── Submissions ──────────────────────────────────────────────────────────────

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assessmentId: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id),
  answers: jsonb("answers").notNull().default({}),
  score: integer("score"),
  totalItems: integer("total_items").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  gradedAt: timestamp("graded_at", { withTimezone: true })
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  workspacesOwned: many(workspaces),
  workspaceMemberships: many(workspaceMembers),
  teachingModules: many(teachingModules),
  teachingMaterials: many(teachingMaterials),
  blueprints: many(blueprints),
  assessments: many(assessments),
  submissions: many(submissions)
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  teachingModules: many(teachingModules),
  assessments: many(assessments)
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id]
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id]
    })
  })
);

export const teachingModulesRelations = relations(
  teachingModules,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [teachingModules.workspaceId],
      references: [workspaces.id]
    }),
    creator: one(users, {
      fields: [teachingModules.creatorId],
      references: [users.id]
    }),
    materials: many(teachingMaterials)
  })
);

export const teachingMaterialsRelations = relations(
  teachingMaterials,
  ({ one, many }) => ({
    module: one(teachingModules, {
      fields: [teachingMaterials.moduleId],
      references: [teachingModules.id]
    }),
    creator: one(users, {
      fields: [teachingMaterials.creatorId],
      references: [users.id]
    }),
    blueprints: many(blueprints)
  })
);

export const blueprintsRelations = relations(blueprints, ({ one, many }) => ({
  material: one(teachingMaterials, {
    fields: [blueprints.materialId],
    references: [teachingMaterials.id]
  }),
  creator: one(users, {
    fields: [blueprints.creatorId],
    references: [users.id]
  }),
  assessmentBlueprints: many(assessmentBlueprints)
}));

export const assessmentsRelations = relations(
  assessments,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [assessments.workspaceId],
      references: [workspaces.id]
    }),
    creator: one(users, {
      fields: [assessments.creatorId],
      references: [users.id]
    }),
    assessmentBlueprints: many(assessmentBlueprints),
    items: many(assessmentItems),
    submissions: many(submissions)
  })
);

export const assessmentBlueprintsRelations = relations(
  assessmentBlueprints,
  ({ one }) => ({
    assessment: one(assessments, {
      fields: [assessmentBlueprints.assessmentId],
      references: [assessments.id]
    }),
    blueprint: one(blueprints, {
      fields: [assessmentBlueprints.blueprintId],
      references: [blueprints.id]
    })
  })
);

export const assessmentItemsRelations = relations(
  assessmentItems,
  ({ one }) => ({
    assessment: one(assessments, {
      fields: [assessmentItems.assessmentId],
      references: [assessments.id]
    })
  })
);

export const submissionsRelations = relations(submissions, ({ one }) => ({
  assessment: one(assessments, {
    fields: [submissions.assessmentId],
    references: [assessments.id]
  }),
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id]
  })
}));
