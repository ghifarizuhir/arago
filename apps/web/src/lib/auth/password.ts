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
