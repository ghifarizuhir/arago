# Phase 4 Slice 12 — Routing & Auth Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable Next.js typed routes, split the NextAuth config so middleware no longer bundles postgres into the Edge runtime, and add the deferred AI stream-wrapper tests.

**Architecture:** Flip `typedRoutes` on and add `as Route` casts only at genuinely-dynamic navigation sites (build-driven enumeration). Apply the standard NextAuth v5 split: an Edge-safe `authConfig` (no DB/bcrypt) used by middleware, and the full config (Credentials + DB authorize) used by the app/API in the Node runtime. Add `MockLanguageModelV1` streaming tests for `streamMaterialChat`/`streamTutor`.

**Tech Stack:** Next.js 15 (typedRoutes), NextAuth v5 beta, Vitest + `ai/test`.

**Security invariants:** the auth split must NOT change auth behavior — JWT strategy, the same `jwt`/`session` callbacks, the same Credentials authorize. Middleware still rejects unauthenticated non-public paths.

---

## File Structure

- Modify `apps/web/next.config.ts` — `typedRoutes: true`.
- Create `apps/web/src/lib/auth/config.ts` — Edge-safe `authConfig`.
- Modify `apps/web/src/lib/auth/index.ts` — spread `authConfig` + add Credentials provider.
- Modify `apps/web/src/middleware.ts` — build `auth` from `authConfig` only.
- Modify dynamic-nav sites flagged by the typed build (login, results pages, …) — `as Route` casts.
- Modify `packages/ai/__tests__/ai.test.ts` — stream-wrapper tests.

---

## Task 1: Edge-safe auth config split

**Files:**
- Create: `apps/web/src/lib/auth/config.ts`
- Modify: `apps/web/src/lib/auth/index.ts`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: create the Edge-safe config**

Create `apps/web/src/lib/auth/config.ts`. It holds everything EXCEPT the Credentials provider (which imports `./password` → bcrypt + db). No imports of `./password`, `bcryptjs`, or `@arago/db`:

```ts
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.email = token.email as string;
      session.user.name = token.name as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: rewrite `index.ts` to spread authConfig + add the provider**

Replace `apps/web/src/lib/auth/index.ts` with:

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { LoginSchema } from '@arago/validators';
import { authConfig } from './config';
import { authenticateUser } from './password';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await authenticateUser(parsed.data.email, parsed.data.password);
        return user ?? null;
      },
    }),
  ],
});
```

- [ ] **Step 3: rewrite middleware to use the Edge config only**

Replace `apps/web/src/middleware.ts` with (same redirect logic, but `auth` built from `authConfig` — no DB import chain):

```ts
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/login', '/register', '/invite', '/api/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'),
  );
}

export default auth((req) => {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

(Note: the previous middleware typed the callback arg as `any`; `auth(...)` now provides the typed `req`, so drop the `any`.)

- [ ] **Step 4: typecheck**

Run: `rm -rf apps/web/.next && pnpm --filter @arago/web typecheck`
Expected: PASS. (If `next-auth` doesn't export `NextAuthConfig` as a type at that path, use `import { type NextAuthConfig } from 'next-auth'` — it does in v5 beta.)

- [ ] **Step 5: commit**

```bash
git add apps/web/src/lib/auth/config.ts apps/web/src/lib/auth/index.ts apps/web/src/middleware.ts
git commit -m "refactor(auth): split Edge-safe authConfig from DB-backed provider; middleware uses JWT-only config"
```

---

## Task 2: Re-enable typedRoutes + cast dynamic sites

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: site files flagged by the build (at minimum: `(auth)/login/page.tsx`, `(student)/student/assessments/[id]/results/page.tsx`)

- [ ] **Step 1: turn typedRoutes on**

In `apps/web/next.config.ts`, change `experimental.typedRoutes` from `false` to `true`. Update the comment above it (the "left off for Phase 1" note) to say it is enabled in Phase 4.

- [ ] **Step 2: run the typed build to enumerate errors**

Run:
```bash
rm -rf apps/web/.next && DATABASE_URL='postgresql://u:p@localhost:5432/build' NEXTAUTH_SECRET='x' SUPABASE_URL='https://x.supabase.co' SUPABASE_SERVICE_KEY='x' pnpm --filter @arago/web build
```
Expected: build FAILS with type errors at dynamic-nav sites (strings not assignable to `Route`). Record each `file:line`.

- [ ] **Step 3: cast each genuinely-dynamic site**

For EACH flagged site, add `import { type Route } from 'next'` to that file and cast the dynamic target with `as Route`. Cast ONLY runtime-dynamic string targets — do NOT cast static or template-literal hrefs that already typecheck. Known sites:
- `apps/web/src/app/(auth)/login/page.tsx` — `router.push(callbackUrl as Route)` (callbackUrl from searchParams).
- `apps/web/src/app/(student)/student/assessments/[id]/results/page.tsx` — `router.replace(\`/student/assessments/${id}\` as Route)` and any `router.push` with a query string.
- Any additional site the build flagged: apply the same `as Route` cast.

Do NOT use `as any`. If a site is a fixed literal that still errors, prefer fixing the literal over casting.

- [ ] **Step 4: rebuild until green**

Run the same build command. Expected: build PASSES with typedRoutes on. Re-run if new sites surface; cast and rebuild until clean.

- [ ] **Step 5: commit**

```bash
git add apps/web/next.config.ts apps/web/src
git commit -m "feat(web): re-enable typedRoutes; cast genuinely-dynamic nav targets as Route"
```

---

## Task 3: AI stream-wrapper tests

**Files:**
- Modify: `packages/ai/__tests__/ai.test.ts`

- [ ] **Step 1: write the failing tests**

Add to `packages/ai/__tests__/ai.test.ts`. Use `MockLanguageModelV1` with `doStream` + `simulateReadableStream` from `ai/test`:

```ts
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test';
import { streamMaterialChat } from '../src/chat.js';
import { streamTutor } from '../src/tutor.js';

function makeStreamModel(text: string): MockLanguageModelV1 {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-delta', textDelta: text },
          { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
        ],
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
}

describe('streamMaterialChat', () => {
  it('uses getModel and streams text through', async () => {
    const spy = vi.spyOn(providers, 'getModel').mockReturnValue(makeStreamModel('halo') as any);
    const result = streamMaterialChat({ materialContent: '<p>x</p>', messages: [{ role: 'user', content: 'hai' }] });
    expect(spy).toHaveBeenCalled();
    let out = '';
    for await (const chunk of result.textStream) out += chunk;
    expect(out).toBe('halo');
  });
});

describe('streamTutor', () => {
  it('uses getModel and streams text through', async () => {
    const spy = vi.spyOn(providers, 'getModel').mockReturnValue(makeStreamModel('jawaban') as any);
    const result = streamTutor({ materialContent: '<p>x</p>', messages: [{ role: 'user', content: 'tanya' }] });
    expect(spy).toHaveBeenCalled();
    let out = '';
    for await (const chunk of result.textStream) out += chunk;
    expect(out).toBe('jawaban');
  });
});
```

(`providers` is already imported in this test file as `import * as providers from '../src/providers/index.js'`. If not, add it.)

- [ ] **Step 2: run to verify they fail then pass**

Run: `pnpm --filter @arago/ai test -- -t "streamMaterialChat"`
Expected: FAIL first if imports/mocks wrong; once correct → PASS. Then run the tutor test. (If `simulateReadableStream`'s chunk shape differs in the installed `ai` version, adjust the chunk objects to the version's `LanguageModelV1StreamPart` shape — the key is a `text-delta` then `finish`.)

- [ ] **Step 3: full AI suite + typecheck**

Run: `pnpm --filter @arago/ai test && pnpm --filter @arago/ai typecheck`
Expected: PASS (existing 21 + 2 new = 23).

- [ ] **Step 4: commit**

```bash
git add packages/ai/__tests__/ai.test.ts
git commit -m "test(ai): stream-wrapper tests for streamMaterialChat + streamTutor"
```

---

## Definition of Done

- [ ] `pnpm --filter @arago/ai test` passes (23).
- [ ] `pnpm -r typecheck` all pass.
- [ ] `next build` succeeds with `typedRoutes: true` and NO "postgres in Edge" / Node-API-in-Edge warning for middleware.
- [ ] `pnpm --filter @arago/web test` still green (auth split changes nothing behaviorally).
- [ ] Manual (real env): login + protected-route redirect still work.

## Self-review notes
- Spec coverage (Slice 12): typedRoutes ✓ (T2), Edge split ✓ (T1), AI stream tests ✓ (T3).
- Auth behavior unchanged: same JWT callbacks/pages moved verbatim into authConfig; provider+authorize unchanged in index.ts.
- The Edge warning resolution is verified by inspecting the build output for the absence of the postgres/Node-API Edge warning.
- typedRoutes casts are build-enumerated, not guessed — cast only what the compiler rejects.
