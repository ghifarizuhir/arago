import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@arago/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock('@arago/db/schema', () => ({
  workspaces: {},
  workspaceMembers: {},
}));

import {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceMember,
  joinWorkspaceByToken,
  generateInviteToken,
} from './workspace';
import { db } from '@arago/db/client';

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

describe('generateInviteToken', () => {
  it('returns a UUID-shaped string', () => {
    const token = generateInviteToken();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns unique values on each call', () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});

describe('createWorkspace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts workspace and owner member, returns workspace', async () => {
    const fakeWorkspace = {
      id: 'ws-1',
      name: 'Test WS',
      slug: 'test-ws',
      ownerId: 'user-1',
      inviteToken: 'tok',
      createdAt: new Date(),
    };

    mockDb.insert.mockImplementationOnce(() => ({
      values: () => ({ returning: () => Promise.resolve([fakeWorkspace]) }),
    }));
    mockDb.insert.mockImplementationOnce(() => ({
      values: () => Promise.resolve([]),
    }));

    const result = await createWorkspace('user-1', { name: 'Test WS', slug: 'test-ws' });
    expect(result).toMatchObject({ id: 'ws-1', name: 'Test WS' });
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});

describe('getUserWorkspaces', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns workspaces for user', async () => {
    const fakeWs = { id: 'ws-1', name: 'Test', slug: 'test', ownerId: 'u1', inviteToken: 't', createdAt: new Date() };

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ workspace: fakeWs }]),
        }),
      }),
    });

    const result = await getUserWorkspaces('user-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'ws-1' });
  });
});

describe('getWorkspaceMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns member when found', async () => {
    const fakeMember = { workspaceId: 'ws-1', userId: 'u-1', role: 'teacher', joinedAt: new Date() };
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([fakeMember]),
        }),
      }),
    });
    const result = await getWorkspaceMember('ws-1', 'u-1');
    expect(result).toMatchObject({ role: 'teacher' });
  });

  it('returns null when not found', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await getWorkspaceMember('ws-1', 'u-999');
    expect(result).toBeNull();
  });
});

describe('joinWorkspaceByToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for unknown token', async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const result = await joinWorkspaceByToken('bad-token', 'u-1');
    expect(result).toBeNull();
  });

  it('returns alreadyMember: true when already a member', async () => {
    const fakeWs = { id: 'ws-1', name: 'WS', slug: 'ws', ownerId: 'owner', inviteToken: 'valid-token', createdAt: new Date() };
    const fakeMember = { workspaceId: 'ws-1', userId: 'u-1', role: 'student', joinedAt: new Date() };

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeWs]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeMember]) }),
        }),
      });

    const result = await joinWorkspaceByToken('valid-token', 'u-1');
    expect(result).toMatchObject({ alreadyMember: true });
  });

  it('inserts student member for new user with valid token', async () => {
    const fakeWs = { id: 'ws-1', name: 'WS', slug: 'ws', ownerId: 'owner', inviteToken: 'valid-token', createdAt: new Date() };

    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeWs]) }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      });

    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });

    const result = await joinWorkspaceByToken('valid-token', 'u-2');
    expect(result).toMatchObject({ alreadyMember: false });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});
