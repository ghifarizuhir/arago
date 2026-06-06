import { NextResponse } from "next/server";
import { db } from "@arago/db/client";
import { standards } from "@arago/db/schema";
import { ilike, or } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.length < 1) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const results = await db
      .select({
        id: standards.id,
        code: standards.code,
        description: standards.description,
        subject: standards.subject,
        gradeLevel: standards.gradeLevel,
        framework: standards.framework,
      })
      .from(standards)
      .where(
        or(
          ilike(standards.code, `%${q}%`),
          ilike(standards.description, `%${q}%`),
          ilike(standards.subject, `%${q}%`)
        )
      )
      .limit(50);

    return NextResponse.json({ standards: results }, { status: 200 });
  } catch (error) {
    console.error("Standards search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
