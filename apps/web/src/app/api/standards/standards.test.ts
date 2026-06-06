import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@arago/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@arago/db/schema", () => ({
  standards: {
    id: "id",
    code: "code",
    description: "description",
    subject: "subject",
    gradeLevel: "gradeLevel",
  },
}));

vi.mock("drizzle-orm", () => ({
  ilike: vi.fn((col, pattern) => ({ col, pattern, type: "ilike" })),
  or: vi.fn((...conditions) => ({ conditions, type: "or" })),
}));

import { requireAuth } from "@/lib/auth/guards";
import { db } from "@arago/db/client";
import { GET } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockDb = vi.mocked(db);

const SAMPLE_STANDARDS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "CCSS.MATH.CONTENT.3.OA.A.1",
    description: "Interpret products of whole numbers",
    subject: "Mathematics",
    gradeLevel: 3,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    code: "CCSS.ELA-LITERACY.RL.5.1",
    description: "Quote accurately from a text",
    subject: "English Language Arts",
    gradeLevel: 5,
  },
];

function makeRequest(q?: string) {
  const url = q
    ? `http://localhost/api/standards?q=${encodeURIComponent(q)}`
    : "http://localhost/api/standards";
  return new Request(url);
}

function makeSelectChain(results: typeof SAMPLE_STANDARDS) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(results),
  };
  vi.mocked(mockDb.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ session: { user: { role: "teacher" } } as never, error: null });
});

describe("GET /api/standards", () => {
  it("returns 401 when not authenticated", async () => {
    const authError = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockRequireAuth.mockResolvedValue({ session: null, error: authError });

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns standards matching the query", async () => {
    makeSelectChain([SAMPLE_STANDARDS[0]!]);

    const res = await GET(makeRequest("math"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.standards).toHaveLength(1);
    expect(body.standards[0]).toMatchObject({
      id: SAMPLE_STANDARDS[0]!.id,
      code: SAMPLE_STANDARDS[0]!.code,
      description: SAMPLE_STANDARDS[0]!.description,
    });
  });

  it("returns all standards when q is omitted", async () => {
    makeSelectChain(SAMPLE_STANDARDS);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.standards).toHaveLength(2);
  });

  it("returns all standards when q is empty string", async () => {
    makeSelectChain(SAMPLE_STANDARDS);

    const res = await GET(makeRequest(""));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.standards)).toBe(true);
  });

  it("response includes id, code, description, subject, gradeLevel", async () => {
    makeSelectChain([SAMPLE_STANDARDS[0]!]);

    const res = await GET(makeRequest("3.OA"));
    const body = await res.json();
    const item = body.standards[0];

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("code");
    expect(item).toHaveProperty("description");
    expect(item).toHaveProperty("subject");
    expect(item).toHaveProperty("gradeLevel");
  });

  it("returns empty array when no standards match", async () => {
    makeSelectChain([]);

    const res = await GET(makeRequest("xyzzy_no_match"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.standards).toHaveLength(0);
  });
});
