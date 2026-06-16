# Arago Phase 1 — Slice 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Turborepo monorepo, the `@arago/validators` package, and the `@arago/db` Drizzle schema so `pnpm install`, `pnpm typecheck`, and DB migration all succeed.

**Architecture:** pnpm + Turborepo monorepo. Packages export raw TypeScript (no build step), transpiled by Next.js. `@arago/validators` holds Zod schemas + enums; `@arago/db` holds the Drizzle schema for all 11 tables plus a typed postgres.js client.

**Tech Stack:** Turborepo 2.4, pnpm 9.15, TypeScript 5.7 (strict + noUncheckedIndexedAccess), Zod 3.24, Drizzle ORM 0.38, postgres.js 3.4, Vitest 3.

**Slice sequence:** This is slice 1 of 5. Run before Slice 2 (Auth & Shell). Each slice is independently testable.

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `pnpm-workspace.yaml`
- Create: `eslint.config.mjs`
- Create: `packages/validators/package.json`
- Create: `packages/validators/tsconfig.json`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/ai/package.json`
- Create: `packages/ai/tsconfig.json`
- Create: `packages/test-utils/package.json`
- Create: `packages/test-utils/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/.env.example`
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1.1: Create root `package.json`**
```json
{
  "name": "arago",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```
Expected: Root manifest defines workspace scripts and dev tooling.

- [ ] **Step 1.2: Create `turbo.json`**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "db:generate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```
Expected: Turbo orchestrates tasks with correct dependency ordering.

- [ ] **Step 1.3: Create `pnpm-workspace.yaml`**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```
Expected: pnpm recognises all workspace members.

- [ ] **Step 1.4: Create `eslint.config.mjs`**
```js
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/drizzle/**"
    ]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error"
    }
  }
];
```
Expected: Unified ESLint v9 flat config applies TypeScript rules across the monorepo.

- [ ] **Step 1.5: Create `packages/validators/package.json`**
```json
{
  "name": "@arago/validators",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```
Expected: Package exports raw TypeScript — no build step required.

- [ ] **Step 1.6: Create `packages/validators/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```
Expected: Strict TypeScript for a pure-Node package with no DOM types.

- [ ] **Step 1.7: Create `packages/db/package.json`**
```json
{
  "name": "@arago/db",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "tsx src/migrate.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arago/validators": "workspace:*",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```
Expected: DB package wires Drizzle + postgres.js and exposes migration scripts. Subpath exports `@arago/db/client` and `@arago/db/schema` are used by `apps/web`.

- [ ] **Step 1.8: Create `packages/db/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src", "drizzle.config.ts"]
}
```
Expected: Strict TypeScript for the DB package; includes drizzle config in compilation.

- [ ] **Step 1.9: Create `packages/db/drizzle.config.ts`**
```ts
import type { Config } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
  },
  verbose: true,
  strict: true
} satisfies Config;
```
Expected: Drizzle Kit reads schema from `src/schema/index.ts` and writes migrations to `drizzle/`.

- [ ] **Step 1.10: Create `packages/ai/package.json`**
```json
{
  "name": "@arago/ai",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./grading": "./src/grading.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arago/validators": "workspace:*",
    "@ai-sdk/anthropic": "^1.1.0",
    "@ai-sdk/openai": "^1.2.0",
    "ai": "^4.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```
Expected: AI package can use both Anthropic and OpenAI providers via Vercel AI SDK v4. Subpath export `@arago/ai/grading` is used in Slice 5.

- [ ] **Step 1.11: Create `packages/ai/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```
Expected: Strict TypeScript for the AI package.

- [ ] **Step 1.12: Create `packages/test-utils/package.json`**
```json
{
  "name": "@arago/test-utils",
  "version": "0.0.1",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arago/db": "workspace:*",
    "@arago/validators": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```
Expected: Test utils can import from db and validators without circular deps.

- [ ] **Step 1.13: Create `packages/test-utils/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```
Expected: Strict TypeScript for test utilities.

- [ ] **Step 1.14: Create `apps/web/package.json`**
```json
{
  "name": "@arago/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arago/ai": "workspace:*",
    "@arago/db": "workspace:*",
    "@arago/validators": "workspace:*",
    "@supabase/supabase-js": "^2.0.0",
    "@tiptap/extension-placeholder": "^2.0.0",
    "@tiptap/react": "^2.0.0",
    "@tiptap/starter-kit": "^2.0.0",
    "ai": "^4.1.0",
    "bcryptjs": "^2.4.3",
    "mammoth": "^1.8.0",
    "next": "^15.2.0",
    "next-auth": "^5.0.0-beta.25",
    "pdf-parse": "^1.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "uuid": "^11.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.0.0",
    "@types/pdf-parse": "^1.1.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/uuid": "^10.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@tailwindcss/typography": "^0.5.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
```
Expected: Web app declares all runtime and dev deps; uses workspace packages via `workspace:*`. `uuid` is used by the Kisi-kisi editor in Slice 4.

- [ ] **Step 1.15: Create `apps/web/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
Expected: Next.js 15 compatible TypeScript config with strict mode and path aliases.

- [ ] **Step 1.16: Create `apps/web/next.config.ts`**
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arago/db", "@arago/ai", "@arago/validators", "@arago/test-utils"],
  experimental: {
    typedRoutes: true
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**"
      }
    ]
  }
};

export default nextConfig;
```
Expected: Next.js transpiles workspace packages (raw `.ts` exports), enables typed routes, allows Supabase Storage images.

- [ ] **Step 1.17: Create `apps/web/next-env.d.ts`**
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.
```
Expected: Next.js type references in place — required for compilation.

- [ ] **Step 1.18: Create `apps/web/.env.example`**
```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/arago

# NextAuth
NEXTAUTH_SECRET=change-me-generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# AI Providers
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```
Expected: Documents all required environment variables; developers copy to `.env.local`.

- [ ] **Step 1.19: Create `apps/web/src/app/globals.css`**
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```
Expected: Tailwind CSS v4 `@import` syntax applied with the typography plugin (used by the Tiptap `prose` editor in Slice 4).

- [ ] **Step 1.20: Create `apps/web/postcss.config.mjs`**
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};
```
Expected: Tailwind v4 PostCSS plugin wired so `next dev`/`next build` process `globals.css`.

- [ ] **Step 1.21: Install dependencies**
```bash
pnpm install
```
Expected: All packages resolved, symlinks created in `node_modules/.pnpm`, zero peer dep errors.

- [ ] **Step 1.22: Verify TypeScript compilation**
```bash
pnpm typecheck
```
Expected: `tsc --noEmit` passes with zero errors across all packages and `apps/web`. (Note: `apps/web` has no source files yet — typecheck of empty app is fine; package typechecks run after Task 2 and Task 3.)

- [ ] **Step 1.23: Commit**
```bash
git add package.json turbo.json pnpm-workspace.yaml eslint.config.mjs \
  packages/validators/package.json packages/validators/tsconfig.json \
  packages/db/package.json packages/db/tsconfig.json packages/db/drizzle.config.ts \
  packages/ai/package.json packages/ai/tsconfig.json \
  packages/test-utils/package.json packages/test-utils/tsconfig.json \
  apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts \
  apps/web/next-env.d.ts apps/web/.env.example apps/web/src/app/globals.css \
  apps/web/postcss.config.mjs pnpm-lock.yaml
git commit -m "feat: scaffold Turborepo monorepo with all package manifests and configs"
```

---

### Task 2: Validators Package

**Files:**
- Create: `packages/validators/src/index.ts`
- Test: `packages/validators/src/index.test.ts`

- [ ] **Step 2.1: Write failing tests first**

Create `packages/validators/src/index.test.ts`:
```ts
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
  CreateAssessmentSchema
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
```
Expected: `pnpm --filter @arago/validators test` reports all tests FAILED (module not found).

- [ ] **Step 2.2: Implement `packages/validators/src/index.ts`**
```ts
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
```
Expected: All 30 test cases pass when `pnpm --filter @arago/validators test` is run.

- [ ] **Step 2.3: Run tests — confirm all pass**
```bash
pnpm --filter @arago/validators test
```
Expected: Output shows `30 passed` with zero failures.

- [ ] **Step 2.4: Typecheck validators package**
```bash
pnpm --filter @arago/validators typecheck
```
Expected: Zero TypeScript errors.

- [ ] **Step 2.5: Commit**
```bash
git add packages/validators/src/index.ts packages/validators/src/index.test.ts
git commit -m "feat(validators): add enums, Zod schemas, and inferred TypeScript types with full test coverage"
```

---

### Task 3: DB Schema + Client

**Files:**
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/migrate.ts`

- [ ] **Step 3.1: Create `packages/db/src/schema/index.ts`**

> NOTE: For Phase 1, `submissions` references `assessmentId` + `studentId` directly (no separate `classAssignments` table — classes arrive in Phase 3). `blueprints.creatorId` is NOT NULL, so every blueprint insert in later slices must set it.

```ts
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
```
Expected: Schema file compiles with zero TypeScript errors; all 11 tables and 3 enums defined.

- [ ] **Step 3.2: Create `packages/db/src/client.ts`**
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env.local or environment."
  );
}

// Connection pool for regular queries
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

// Single connection for migrations (drizzle-kit manages its own)
export const migrationClient = postgres(process.env.DATABASE_URL, {
  max: 1
});

export const db = drizzle(queryClient, {
  schema,
  logger: process.env.NODE_ENV === "development"
});

export type Database = typeof db;
```
Expected: `db` is a typed Drizzle instance with full schema awareness; pool configured for Supabase connection limits.

- [ ] **Step 3.3: Create `packages/db/src/migrate.ts`**
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });

async function runMigrations(): Promise<void> {
  console.log("Running migrations...");
  const db = drizzle(migrationClient);
  await migrate(db, {
    migrationsFolder: path.join(__dirname, "../drizzle")
  });
  console.log("Migrations complete.");
  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```
Expected: `pnpm --filter @arago/db db:migrate` applies all pending SQL migrations from the `drizzle/` folder.

- [ ] **Step 3.4: Create `packages/db/src/index.ts`**
```ts
export { db, migrationClient } from "./client.js";
export type { Database } from "./client.js";
export * from "./schema/index.js";
```
Expected: Single entry point re-exports `db`, `migrationClient`, all table objects, and all enum types.

- [ ] **Step 3.5: Typecheck the DB package**
```bash
pnpm --filter @arago/db typecheck
```
Expected: Zero TypeScript errors across `client.ts`, `schema/index.ts`, `migrate.ts`, `index.ts`.

- [ ] **Step 3.6: Generate initial migration**

Ensure `DATABASE_URL` is set in your shell (copy from `.env.example`, point at a local or Supabase dev DB):
```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/arago_dev
pnpm --filter @arago/db db:generate
```
Expected: Drizzle Kit introspects `src/schema/index.ts` and writes `packages/db/drizzle/0000_*.sql` containing `CREATE TYPE`, `CREATE TABLE`, and `CONSTRAINT` statements for all 11 tables. A `packages/db/drizzle/meta/_journal.json` is also created.

- [ ] **Step 3.7: Inspect generated SQL**
```bash
cat packages/db/drizzle/0000_*.sql
```
Expected: File contains in order:
1. `CREATE TYPE "public"."workspace_member_role"` with values `owner`, `teacher`, `student`
2. `CREATE TYPE "public"."content_status"` with values `draft`, `published`
3. `CREATE TYPE "public"."curriculum_type"` with values `merdeka`, `k13`, `custom`
4. All 11 `CREATE TABLE` statements with correct column names, types, NOT NULL constraints, and foreign keys

- [ ] **Step 3.8: Push schema to database**
```bash
pnpm --filter @arago/db db:push
```
Expected: Drizzle Kit connects to `DATABASE_URL`, creates all enums and tables. Output ends with `All changes applied`.

- [ ] **Step 3.9: Verify no schema drift**
```bash
pnpm --filter @arago/db db:generate
```
Expected: Drizzle Kit outputs `No changes detected in schema` — confirming DB state matches schema file exactly.

- [ ] **Step 3.10: Commit**
```bash
git add packages/db/src/schema/index.ts \
  packages/db/src/client.ts \
  packages/db/src/index.ts \
  packages/db/src/migrate.ts \
  packages/db/drizzle/
git commit -m "feat(db): add Drizzle schema for all 11 tables, typed client, and initial migration"
```

---

## Slice 1 Done — Definition of Done

- `pnpm install` resolves with zero errors
- `pnpm --filter @arago/validators test` → 30 passed
- `pnpm --filter @arago/db typecheck` → zero errors
- `pnpm --filter @arago/db db:push` applies all 11 tables + 3 enums; re-running `db:generate` shows no drift

**Next:** Slice 2 — Auth & Shell (`2026-06-16-arago-phase1-slice2-auth-shell.md`).
