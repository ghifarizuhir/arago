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

  it('returns null when user is soft-deleted even with correct password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('correct', 4);

    const mockUser = {
      id: 'user-1',
      email: 'deleted@example.com',
      name: 'Deleted User',
      passwordHash: hash,
      deletedAt: new Date(),
    };

    const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockUser]),
        }),
      }),
    });

    const result = await authenticateUser('deleted@example.com', 'correct');
    expect(result).toBeNull();
  });
});
