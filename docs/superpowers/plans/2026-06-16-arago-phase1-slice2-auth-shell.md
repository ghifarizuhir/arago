# Arago Phase 1 — Slice 2: Auth & Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can register, log in, create/join a workspace, select it (cookie), and land on a dashboard inside the fixed-sidebar app shell.

**Architecture:** NextAuth v5 (JWT, Credentials provider). Per-workspace membership rows — no global role on `users`. Active workspace stored in an httpOnly cookie `arago-workspace-id`. The `(app)` route group is gated by auth + workspace cookie and renders a fixed sidebar.

**Tech Stack:** Next.js 15 App Router, NextAuth v5 beta, bcryptjs, Drizzle, Vitest.

**Slice sequence:** Slice 2 of 5. Requires Slice 1 complete (`@arago/db`, `@arago/validators` working). Run before Slice 3.

**Reconciliation note:** The original draft had two competing `(app)/layout.tsx` + `sidebar.tsx` versions. This slice uses ONE canonical pair: `Sidebar` takes `workspaceName` and links to the real routes (`/dashboard`, `/modules`, `/blueprints`, `/assessments`, `/settings`), no icon library. The layout reads the workspace cookie and looks up the workspace (note: `workspaces` has NO `deletedAt` column, so no soft-delete filter).

---

### Task 0: Vitest config for the web app

**Files:**
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 0.1: Create `apps/web/vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```
Expected: `pnpm --filter @arago/web test` discovers `*.test.ts(x)` files and resolves the `@/` alias.

- [ ] **Step 0.2: Commit**
```bash
git add apps/web/vitest.config.ts
git commit -m "chore(web): add vitest config with @ alias"
```

---

### Task 1: Auth (register, login, guards, middleware)

**Files:**
- Create: `apps/web/src/lib/auth/password.ts`
- Create: `apps/web/src/lib/auth/types.ts`
- Create: `apps/web/src/types/next-auth.d.ts`
- Create: `apps/web/src/lib/auth/index.ts`
- Create: `apps/web/src/lib/auth/guards.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/app/api/auth/register/route.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`
- Test: `apps/web/src/lib/auth/password.test.ts`
- Test: `apps/web/src/app/api/auth/register/register.test.ts`

- [ ] **Step 1.1: Password utilities** — `apps/web/src/lib/auth/password.ts`
```typescript
import bcrypt from 'bcryptjs';
import { db } from '@arago/db/client';
import { users } from '@arago/db/schema';
import { eq } from 'drizzle-orm';

const COST = process.env.NODE_ENV === 'test' ? 4 : 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  if (user.deletedAt !== null) return null;

  return { id: user.id, email: user.email, name: user.name };
}
```
Expected: `hashPassword` returns a bcrypt string starting with `$2`. `authenticateUser` returns user object on correct credentials, `null` on wrong password / unknown email / soft-deleted user.

- [ ] **Step 1.2: Session types** — `apps/web/src/lib/auth/types.ts`
```typescript
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
```

`apps/web/src/types/next-auth.d.ts`
```typescript
import type { DefaultSession } from 'next-auth';
import type { SessionUser } from '@/lib/auth/types';

declare module 'next-auth' {
  interface Session {
    user: SessionUser & DefaultSession['user'];
  }

  interface User extends SessionUser {}
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string;
  }
}
```
Expected: TypeScript resolves `session.user.id` without casting.

- [ ] **Step 1.3: NextAuth v5 config** — `apps/web/src/lib/auth/index.ts`
```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { LoginSchema } from '@arago/validators';
import { authenticateUser } from './password';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await authenticateUser(
          parsed.data.email,
          parsed.data.password,
        );
        return user ?? null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email as string;
        token.name = user.name as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.name = token.name;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
```
Expected: Exports `handlers`, `auth`, `signIn`, `signOut`. JWT stores `id`, `email`, `name` (NO role).

- [ ] **Step 1.4: Auth guards** — `apps/web/src/lib/auth/guards.ts`
```typescript
import { NextResponse } from 'next/server';
import { auth } from './index';
import { db } from '@arago/db/client';
import { workspaceMembers } from '@arago/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Session } from 'next-auth';

type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;

interface AuthResult {
  session: Session | null;
  error: NextResponse | null;
}

interface MemberResult {
  session: Session | null;
  member: WorkspaceMemberRow | null;
  error: NextResponse | null;
}

export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session, error: null };
}

export async function requireWorkspaceMember(
  workspaceId: string,
): Promise<MemberResult> {
  const { session, error } = await requireAuth();
  if (error || !session) return { session: null, member: null, error };

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!member) {
    return {
      session,
      member: null,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { session, member, error: null };
}

export async function requireWorkspaceTeacher(
  workspaceId: string,
): Promise<MemberResult> {
  const { session, member, error } = await requireWorkspaceMember(workspaceId);
  if (error || !session || !member) return { session, member: null, error };

  if (member.role !== 'teacher' && member.role !== 'owner') {
    return {
      session,
      member,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { session, member, error: null };
}
```
Expected: `requireAuth` → 401 when no session. `requireWorkspaceMember` → 403 when not a member. `requireWorkspaceTeacher` → 403 when role is `student`.

- [ ] **Step 1.5: Middleware** — `apps/web/src/middleware.ts`
```typescript
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/invite',
  '/api/auth',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'),
  );
}

export default auth((req: NextRequest & { auth: Awaited<ReturnType<typeof auth>> | null }) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!req.auth?.user?.id) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```
Expected: Unauthenticated requests to protected routes redirect to `/login?callbackUrl=<path>`. Public paths and static assets pass through.

- [ ] **Step 1.6: NextAuth route handler** — `apps/web/src/app/api/auth/[...nextauth]/route.ts`
```typescript
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```
Expected: `/api/auth/signin`, `/api/auth/session`, `/api/auth/signout` all respond.

- [ ] **Step 1.7: Register API route** — `apps/web/src/app/api/auth/register/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { RegisterSchema } from '@arago/validators';
import { db } from '@arago/db/client';
import { users } from '@arago/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({ name, email: normalizedEmail, passwordHash })
    .returning({ id: users.id, email: users.email, name: users.name });

  return NextResponse.json(user, { status: 201 });
}
```
Expected: `201` with `{ id, email, name }` on valid input. `409` on duplicate email. `400` on schema violations / invalid JSON.

- [ ] **Step 1.8: Login page** — `apps/web/src/app/(auth)/login/page.tsx`
```tsx
'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/workspaces';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Email atau password salah.');
      return;
    }

    router.push(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Masuk ke Arago</h1>
          <p className="mt-1 text-sm text-gray-500">
            Belum punya akun?{' '}
            <Link href="/register" className="text-blue-600 hover:underline">
              Daftar sekarang
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Memuat...' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
```
Expected: Submits via `signIn('credentials', { redirect: false })`. On success redirects to `callbackUrl` or `/workspaces`. On failure shows inline error.

- [ ] **Step 1.9: Register page** — `apps/web/src/app/(auth)/register/page.tsx`
```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    setLoading(false);

    if (res.status === 409) {
      setError('Email sudah terdaftar.');
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Terjadi kesalahan.');
      return;
    }

    router.push('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buat Akun Arago</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sudah punya akun?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              Masuk
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nama Lengkap
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Mendaftar...' : 'Daftar'}
          </button>
        </form>
      </div>
    </main>
  );
}
```
Expected: On success POSTs to `/api/auth/register` and redirects to `/login`. 409 → "Email sudah terdaftar."

- [ ] **Step 1.10: Tests** — `apps/web/src/lib/auth/password.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@arago/db/client', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@arago/db/schema', () => ({
  users: {},
}));

import { hashPassword, authenticateUser } from './password';
import { db } from '@arago/db/client';

describe('hashPassword', () => {
  it('returns a bcrypt hash', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('returns different hashes for the same password', async () => {
    const a = await hashPassword('mypassword');
    const b = await hashPassword('mypassword');
    expect(a).not.toBe(b);
  });
});

describe('authenticateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user on correct password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('correct', 4);

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: hash,
      deletedAt: null,
    };

    const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockUser]),
        }),
      }),
    });

    const result = await authenticateUser('test@example.com', 'correct');
    expect(result).toEqual({ id: 'user-1', email: 'test@example.com', name: 'Test User' });
  });

  it('returns null on wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('correct', 4);

    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: hash,
      deletedAt: null,
    };

    const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockUser]),
        }),
      }),
    });

    const result = await authenticateUser('test@example.com', 'wrong');
    expect(result).toBeNull();
  });

  it('returns null when user not found', async () => {
    const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await authenticateUser('nobody@example.com', 'any');
    expect(result).toBeNull();
  });
});
```

`apps/web/src/app/api/auth/register/register.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@arago/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock('@arago/db/schema', () => ({
  users: {},
}));

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$2b$04$hashed'),
}));

import { POST } from './route';
import { db } from '@arago/db/client';

const validBody = { name: 'Test User', email: 'test@example.com', password: 'password123' };

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 on valid registration', async () => {
    const mockDb = db as unknown as {
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
    };

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'user-1', email: 'test@example.com', name: 'Test User' },
        ]),
      }),
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ id: 'user-1', email: 'test@example.com', name: 'Test User' });
  });

  it('returns 409 on duplicate email', async () => {
    const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'existing-user' }]),
        }),
      }),
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 400 on missing name', async () => {
    const res = await POST(makeRequest({ email: 'test@example.com', password: 'password123' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on short password', async () => {
    const res = await POST(makeRequest({ name: 'Test', email: 'test@example.com', password: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 1.11: Run auth tests**
```bash
pnpm --filter @arago/web test
```
Expected: password + register tests pass (8 cases). bcrypt cost 4 under `NODE_ENV=test`.

- [ ] **Step 1.12: Commit**
```bash
git add apps/web/src/lib/auth/ \
        apps/web/src/types/next-auth.d.ts \
        apps/web/src/middleware.ts \
        apps/web/src/app/api/auth/ \
        "apps/web/src/app/(auth)/"
git commit -m "feat(auth): register, login, guards, middleware, NextAuth v5 config (KAR-4)"
```

---

### Task 2: App Shell (root layout, workspace context, sidebar, dashboard)

**Files:**
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/workspace-context.ts`
- Create: `apps/web/src/components/sidebar.tsx`
- Create: `apps/web/src/app/(app)/dashboard/page.tsx`

> The `(app)/layout.tsx` itself is created in Task 3 (it depends on workspace helpers).

- [ ] **Step 2.1: Root layout** — `apps/web/src/app/layout.tsx`
```tsx
import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from 'next-auth/react';

export const metadata: Metadata = {
  title: 'Arago — Platform Guru Cerdas',
  description: 'AI-powered teaching platform for Indonesian K-12 educators',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```
Expected: Session context available everywhere; `lang="id"`.

- [ ] **Step 2.2: Root page redirect** — `apps/web/src/app/page.tsx`
```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/workspaces');
}
```
Expected: Visiting `/` redirects to `/workspaces`.

- [ ] **Step 2.3: Workspace context helper** — `apps/web/src/lib/workspace-context.ts`
```typescript
import { cookies } from 'next/headers';

export const WORKSPACE_COOKIE = 'arago-workspace-id';

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;
}
```
Expected: Returns workspace ID string when cookie set, `null` otherwise.

- [ ] **Step 2.4: Sidebar component (canonical)** — `apps/web/src/components/sidebar.tsx`
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/modules', label: 'Modul Ajar' },
  { href: '/blueprints', label: 'Kisi-kisi' },
  { href: '/assessments', label: 'Asesmen' },
  { href: '/settings', label: 'Pengaturan' },
] as const;

interface SidebarProps {
  workspaceName: string;
}

export function Sidebar({ workspaceName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Workspace
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-gray-900">
          {workspaceName}
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-2 py-4">
        <Link
          href="/workspaces"
          className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Ganti Workspace
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Keluar
        </button>
      </div>
    </aside>
  );
}
```
Expected: Active link highlighted; routes match the real pages built in Slices 3–5; sign-out + switch-workspace at the bottom. No external icon dependency.

- [ ] **Step 2.5: Dashboard page** — `apps/web/src/app/(app)/dashboard/page.tsx`
```tsx
import { db } from '@arago/db/client';
import { teachingModules, assessments } from '@arago/db/schema';
import { eq, isNull, and, count, desc } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  const [moduleCountResult, assessmentCountResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(teachingModules)
      .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt))),
    db
      .select({ count: count() })
      .from(assessments)
      .where(and(eq(assessments.workspaceId, workspaceId), isNull(assessments.deletedAt))),
  ]);

  const moduleCount = moduleCountResult[0]?.count ?? 0;
  const assessmentCount = assessmentCountResult[0]?.count ?? 0;

  const recentModules = await db
    .select({
      id: teachingModules.id,
      title: teachingModules.title,
      status: teachingModules.status,
      createdAt: teachingModules.createdAt,
    })
    .from(teachingModules)
    .where(and(eq(teachingModules.workspaceId, workspaceId), isNull(teachingModules.deletedAt)))
    .orderBy(desc(teachingModules.createdAt))
    .limit(5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Modul Ajar" value={moduleCount} />
        <StatCard label="Total Asesmen" value={assessmentCount} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Modul Terbaru</h2>
        {recentModules.length === 0 ? (
          <p className="text-sm text-gray-500">Belum ada modul. Buat modul pertama Anda.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentModules.map((mod) => (
              <li key={mod.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{mod.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    mod.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {mod.status === 'published' ? 'Diterbitkan' : 'Draf'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
```
Expected: Live counts from DB and 5 most recent modules. (Uses `and(eq, isNull)` — NOT the JS `&&` short-circuit.)

- [ ] **Step 2.6: Commit**
```bash
git add apps/web/src/app/layout.tsx \
        apps/web/src/app/page.tsx \
        apps/web/src/lib/workspace-context.ts \
        apps/web/src/components/sidebar.tsx \
        "apps/web/src/app/(app)/dashboard/page.tsx"
git commit -m "feat(web): app shell — root layout, workspace context, sidebar, dashboard (KAR-7)"
```

---

### Task 3: Workspace CRUD + Invite + (app) layout gate

**Files:**
- Create: `apps/web/src/lib/workspace.ts`
- Create: `apps/web/src/app/api/workspaces/route.ts`
- Create: `apps/web/src/app/api/workspaces/[id]/select/route.ts`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(workspace-select)/workspaces/page.tsx`
- Create: `apps/web/src/app/(workspace-select)/workspaces/new/page.tsx`
- Create: `apps/web/src/app/invite/[token]/page.tsx`
- Test: `apps/web/src/lib/workspace.test.ts`

- [ ] **Step 3.1: Workspace server helpers** — `apps/web/src/lib/workspace.ts`
```typescript
import { db } from '@arago/db/client';
import { workspaces, workspaceMembers } from '@arago/db/schema';
import { eq, and } from 'drizzle-orm';
import type { CreateWorkspaceSchema } from '@arago/validators';
import type { z } from 'zod';

export type WorkspaceData = z.infer<typeof CreateWorkspaceSchema>;

export function generateInviteToken(): string {
  return crypto.randomUUID();
}

export async function createWorkspace(
  userId: string,
  data: WorkspaceData,
): Promise<typeof workspaces.$inferSelect> {
  const inviteToken = generateInviteToken();

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: data.name,
      slug: data.slug,
      ownerId: userId,
      inviteToken,
    })
    .returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'owner',
  });

  return workspace;
}

export async function getUserWorkspaces(
  userId: string,
): Promise<(typeof workspaces.$inferSelect)[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return rows.map((r) => r.workspace);
}

export async function getWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<typeof workspaceMembers.$inferSelect | null> {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  return member ?? null;
}

export async function joinWorkspaceByToken(
  token: string,
  userId: string,
): Promise<{ workspace: typeof workspaces.$inferSelect; alreadyMember: boolean } | null> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.inviteToken, token))
    .limit(1);

  if (!workspace) return null;

  const existing = await getWorkspaceMember(workspace.id, userId);
  if (existing) return { workspace, alreadyMember: true };

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'student',
  });

  return { workspace, alreadyMember: false };
}
```
Expected: `createWorkspace` inserts workspace + owner row. `joinWorkspaceByToken` idempotent. `getUserWorkspaces` returns only the user's workspaces.

- [ ] **Step 3.2: Workspace API routes** — `apps/web/src/app/api/workspaces/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { CreateWorkspaceSchema } from '@arago/validators';
import { requireAuth } from '@/lib/auth/guards';
import { createWorkspace } from '@/lib/workspace';

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const workspace = await createWorkspace(session.user.id, parsed.data);
    return NextResponse.json(workspace, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
    }
    throw err;
  }
}
```

`apps/web/src/app/api/workspaces/[id]/select/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceMember } from '@/lib/auth/guards';
import { cookies } from 'next/headers';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { error } = await requireWorkspaceMember(id);
  if (error) return error;

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true });
}
```
Expected: `POST /api/workspaces` → 201 with workspace (409 on slug clash). `POST /api/workspaces/[id]/select` verifies membership before setting cookie.

- [ ] **Step 3.3: (app) layout gate** — `apps/web/src/app/(app)/layout.tsx`
```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@arago/db/client';
import { workspaces } from '@arago/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentWorkspaceId } from '@/lib/workspace-context';
import { getWorkspaceMember } from '@/lib/workspace';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect('/workspaces');

  // Authz: confirm the user is a MEMBER of the cookie's workspace, not just that it exists.
  const member = await getWorkspaceMember(workspaceId, session.user.id);
  if (!member) redirect('/workspaces');

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) redirect('/workspaces');

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar workspaceName={workspace.name} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```
> IMPORTANT — route groups: `/workspaces` and `/workspaces/new` must NOT live inside the `(app)` group. This layout redirects to `/workspaces` whenever there is no workspace cookie; if the workspaces pages were under `(app)`, that redirect would re-enter this same layout and Next.js would throw `ERR_TOO_MANY_REDIRECTS` (Next does NOT short-circuit self-redirects). Put the workspace-selection pages in a SEPARATE route group — `apps/web/src/app/(workspace-select)/workspaces/page.tsx` and `(workspace-select)/workspaces/new/page.tsx` — which inherits only the root layout (no workspace gate). The selection page sets the cookie via server action, then navigates to `/dashboard`. (URLs stay `/workspaces` and `/workspaces/new`; route-group names in parens don't appear in the URL.)

Expected: Unauthenticated → `/login`. No workspace cookie, or user not a member of the cookie's workspace → `/workspaces`. Otherwise renders sidebar + content.

- [ ] **Step 3.4: Workspaces list page** — `apps/web/src/app/(workspace-select)/workspaces/page.tsx`
```tsx
import { auth } from '@/lib/auth';
import { getUserWorkspaces } from '@/lib/workspace';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const workspaceList = await getUserWorkspaces(session.user.id);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Workspace Anda</h1>
          <Link
            href="/workspaces/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + Buat Baru
          </Link>
        </div>

        {workspaceList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-gray-500">Anda belum bergabung dengan workspace apapun.</p>
            <Link
              href="/workspaces/new"
              className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Buat Workspace Pertama
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {workspaceList.map((ws) => (
              <li key={ws.id}>
                <form
                  action={async () => {
                    'use server';
                    const { cookies } = await import('next/headers');
                    const { redirect: redir } = await import('next/navigation');
                    const cookieStore = await cookies();
                    cookieStore.set(WORKSPACE_COOKIE, ws.id, {
                      httpOnly: true,
                      sameSite: 'lax',
                      path: '/',
                      maxAge: 60 * 60 * 24 * 30,
                    });
                    redir('/dashboard');
                  }}
                >
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{ws.name}</p>
                      <p className="text-sm text-gray-400">/{ws.slug}</p>
                    </div>
                    <span className="text-gray-400">→</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```
Expected: Lists the user's workspaces. Selecting sets the cookie via Server Action and redirects to `/dashboard`. Empty state CTA.

- [ ] **Step 3.5: Create workspace page** — `apps/web/src/app/(workspace-select)/workspaces/new/page.tsx`
```tsx
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function NewWorkspacePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? 'Terjadi kesalahan.');
      setLoading(false);
      return;
    }

    const workspace = (await res.json()) as { id: string };
    await fetch(`/api/workspaces/${workspace.id}/select`, { method: 'POST' });
    router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buat Workspace</h1>
          <p className="mt-1 text-sm text-gray-500">
            <Link href="/workspaces" className="text-blue-600 hover:underline">
              ← Kembali ke daftar workspace
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Nama Workspace
            </label>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="SMA Negeri 1 Jakarta"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
              Slug (URL)
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                arago.id/
              </span>
              <input
                id="slug"
                type="text"
                required
                minLength={2}
                pattern="[a-z0-9-]+"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="sma-negeri-1-jakarta"
                className="block w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">Hanya huruf kecil, angka, dan tanda hubung.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Membuat...' : 'Buat Workspace'}
          </button>
        </form>
      </div>
    </main>
  );
}
```
Expected: Slug auto-derives until edited. On success selects workspace then redirects to `/dashboard`. 409 → "Slug already taken".

- [ ] **Step 3.6: Invite page** — `apps/web/src/app/invite/[token]/page.tsx`
```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { joinWorkspaceByToken } from '@/lib/workspace';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/invite/${token}`);
  }

  const result = await joinWorkspaceByToken(token, session.user.id);

  if (!result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm rounded-xl bg-white p-8 shadow text-center">
          <h1 className="text-xl font-bold text-gray-900">Tautan Tidak Valid</h1>
          <p className="mt-2 text-sm text-gray-500">
            Tautan undangan ini tidak ditemukan atau sudah kadaluarsa.
          </p>
        </div>
      </main>
    );
  }

  redirect('/workspaces');
}
```
Expected: Unauthenticated → `/login` with `callbackUrl`. Invalid token → error. Valid token → join as `student`, redirect `/workspaces`.

- [ ] **Step 3.7: Workspace helper tests** — `apps/web/src/lib/workspace.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@arago/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock('@arago/db/schema', () => ({
  workspaces: {},
  workspaceMembers: {},
}));

import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceMember,
  joinWorkspaceByToken,
  generateInviteToken,
} from './workspace';
import { db } from '@arago/db/client';

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

describe('generateInviteToken', () => {
  it('returns a UUID-shaped string', () => {
    const token = generateInviteToken();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns unique values on each call', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe('createWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts workspace and owner member, returns workspace', async () => {
    const fakeWorkspace = {
      id: 'ws-1',
      name: 'Test WS',
      slug: 'test-ws',
      ownerId: 'user-1',
      inviteToken: 'tok',
      createdAt: new Date(),
    };

    mockDb.insert.mockImplementationOnce(() => ({
      values: () => ({ returning: () => Promise.resolve([fakeWorkspace]) }),
    }));
    mockDb.insert.mockImplementationOnce(() => ({
      values: () => Promise.resolve([]),
    }));

    const result = await createWorkspace('user-1', { name: 'Test WS', slug: 'test-ws' });
    expect(result).toMatchObject({ id: 'ws-1', name: 'Test WS' });
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});

describe('getUserWorkspaces', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns workspaces for user', async () => {
    const fakeWs = { id: 'ws-1', name: 'Test', slug: 'test', ownerId: 'u1', inviteToken: 't', createdAt: new Date() };

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ workspace: fakeWs }]),
        }),
      }),
    });

    const result = await getUserWorkspaces('user-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'ws-1' });
  });
});

describe('getWorkspaceMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns member when found', async () => {
    const fakeMember = { workspaceId: 'ws-1', userId: 'u-1', role: 'teacher', joinedAt: new Date() };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([fakeMember]),
        }),
      }),
    });
    const result = await getWorkspaceMember('ws-1', 'u-1');
    expect(result).toMatchObject({ role: 'teacher' });
  });

  it('returns null when not found', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await getWorkspaceMember('ws-1', 'u-999');
    expect(result).toBeNull();
  });
});

describe('joinWorkspaceByToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for unknown token', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await joinWorkspaceByToken('bad-token', 'u-1');
    expect(result).toBeNull();
  });

  it('returns alreadyMember: true when already a member', async () => {
    const fakeWs = { id: 'ws-1', name: 'WS', slug: 'ws', ownerId: 'owner', inviteToken: 'valid-token', createdAt: new Date() };
    const fakeMember = { workspaceId: 'ws-1', userId: 'u-1', role: 'student', joinedAt: new Date() };

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeWs]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeMember]) }),
        }),
      });

    const result = await joinWorkspaceByToken('valid-token', 'u-1');
    expect(result).toMatchObject({ alreadyMember: true });
  });

  it('inserts student member for new user with valid token', async () => {
    const fakeWs = { id: 'ws-1', name: 'WS', slug: 'ws', ownerId: 'owner', inviteToken: 'valid-token', createdAt: new Date() };

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeWs]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      });

    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });

    const result = await joinWorkspaceByToken('valid-token', 'u-2');
    expect(result).toMatchObject({ alreadyMember: false });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.8: Run tests**
```bash
pnpm --filter @arago/web test
```
Expected: All auth + workspace tests pass.

- [ ] **Step 3.9: Commit**
```bash
git add apps/web/src/lib/workspace.ts \
        apps/web/src/lib/workspace.test.ts \
        apps/web/src/app/api/workspaces/ \
        "apps/web/src/app/(app)/layout.tsx" \
        "apps/web/src/app/(workspace-select)/workspaces/" \
        apps/web/src/app/invite/
git commit -m "feat(workspace): CRUD, invite flow, selection cookie, (app) layout gate (KAR-5)"
```

---

## Slice 2 Done — Definition of Done

- `pnpm --filter @arago/web test` → all auth + workspace unit tests pass
- Manual smoke: register → login → create workspace → land on `/dashboard` with sidebar
- Invite link joins a second account as `student`

**Next:** Slice 3 — AI Engine & Modul Ajar (`2026-06-16-arago-phase1-slice3-ai-modul.md`).
