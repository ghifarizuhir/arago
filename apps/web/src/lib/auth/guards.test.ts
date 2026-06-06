import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireRole, requireTeacher, requireAdmin, requireAuth } from "@/lib/auth/guards";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return session when user is authenticated", async () => {
    const mockSession = {
      user: { id: "1", email: "test@arago.dev", role: "teacher", schoolId: null },
    };
    mockAuth.mockResolvedValue(mockSession);

    const { session, error } = await requireAuth();
    expect(session).toEqual(mockSession);
    expect(error).toBeNull();
  });

  it("should return 401 error when no session", async () => {
    mockAuth.mockResolvedValue(null);

    const { session, error } = await requireAuth();
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("should return 401 error when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });

    const { session, error } = await requireAuth();
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should allow access when user has matching role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@arago.dev", role: "admin", schoolId: null },
    });

    const { session, error } = await requireRole("admin");
    expect(session).not.toBeNull();
    expect(error).toBeNull();
  });

  it("should return 403 when user role is not allowed", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "student@arago.dev", role: "student", schoolId: null },
    });

    const { session, error } = await requireRole("admin");
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("should allow access when user has any of the allowed roles", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "teacher@arago.dev", role: "teacher", schoolId: null },
    });

    const { session, error } = await requireRole("teacher", "admin");
    expect(session).not.toBeNull();
    expect(error).toBeNull();
  });
});

describe("requireTeacher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should allow teachers", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "teacher@arago.dev", role: "teacher", schoolId: null },
    });

    const { session, error } = await requireTeacher();
    expect(session).not.toBeNull();
    expect(error).toBeNull();
  });

  it("should allow admins (teachers are a superset)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@arago.dev", role: "admin", schoolId: null },
    });

    const { session, error } = await requireTeacher();
    expect(session).not.toBeNull();
    expect(error).toBeNull();
  });

  it("should reject students", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "student@arago.dev", role: "student", schoolId: null },
    });

    const { session, error } = await requireTeacher();
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should allow admins", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "admin@arago.dev", role: "admin", schoolId: null },
    });

    const { session, error } = await requireAdmin();
    expect(session).not.toBeNull();
    expect(error).toBeNull();
  });

  it("should reject teachers", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "teacher@arago.dev", role: "teacher", schoolId: null },
    });

    const { session, error } = await requireAdmin();
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("should reject students", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", email: "student@arago.dev", role: "student", schoolId: null },
    });

    const { session, error } = await requireAdmin();
    expect(session).toBeNull();
    expect(error).not.toBeNull();
  });
});