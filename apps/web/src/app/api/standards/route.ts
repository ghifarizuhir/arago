import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { db } from "@arago/db/client";
import { standards } from "@arago/db/schema";
import { ilike, or } from "drizzle-orm";

export async function GET(request: Request) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const results = await db
    .select({
      id: standards.id,
      code: standards.code,
      description: standards.description,
      subject: standards.subject,
      gradeLevel: standards.gradeLevel,
    })
    .from(standards)
    .where(
      q
        ? or(
            ilike(standards.code, `%${q}%`),
            ilike(standards.description, `%${q}%`),
            ilike(standards.subject, `%${q}%`)
          )
        : undefined
    )
    .limit(50)
    .orderBy(standards.code);

  return NextResponse.json({ standards: results });
}
