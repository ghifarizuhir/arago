import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@arago/validators";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

export async function requireRole(...roles: UserRole[]) {
  const { session, error } = await requireAuth();
  if (error) return { session: null, error };

  if (!roles.includes(session.user.role as UserRole)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session, error: null };
}

export function requireTeacher() {
  return requireRole("teacher", "admin");
}

export function requireAdmin() {
  return requireRole("admin");
}