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
