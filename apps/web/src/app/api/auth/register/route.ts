import { type NextRequest, NextResponse } from 'next/server';
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

  try {
    const [user] = await db
      .insert(users)
      .values({ name, email: normalizedEmail, passwordHash })
      .returning({ id: users.id, email: users.email, name: users.name });

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const errMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    const errCode = err instanceof Error && 'code' in err ? (err as any).code : '';
    if (errMsg.includes('unique') || errMsg.includes('duplicate') || errCode === '23505') {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    throw err;
  }
}
