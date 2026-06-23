import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  requireRole,
  requireMinRole,
  requireApprovalRole,
  requireWriteRole,
  requireReadRole,
} from './rbac.js'

// Exercise the REAL rbac middleware (the route integration tests mock it away, so its
// role-hierarchy logic was untested — this closes that gap). Mock only the membership lookup.
// vi.hoisted so the fn exists when the hoisted vi.mock factory runs.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('@contento/db', () => ({
  prisma: { membership: { findUnique } },
}))

type Reply = {
  status: (code: number) => Reply
  send: (body: unknown) => Reply
  _code: number | null
  _body: unknown
}

function makeReq(authUser: { userId: string } | null, workspaceId?: string) {
  // Cast through unknown — we only use the fields the middleware reads.
  return { authUser, params: workspaceId ? { workspaceId } : {} } as unknown as Parameters<
    ReturnType<typeof requireRole>
  >[0]
}

function makeReply(): Reply {
  const reply = {
    _code: null as number | null,
    _body: undefined as unknown,
    status(code: number) {
      this._code = code
      return this
    },
    send(body: unknown) {
      this._body = body
      return this
    },
  }
  return reply as Reply
}

const replyArg = (r: Reply) => r as unknown as Parameters<ReturnType<typeof requireRole>>[1]

beforeEach(() => {
  findUnique.mockReset()
})

describe('requireRole', () => {
  it('401 when there is no authenticated user', async () => {
    const reply = makeReply()
    await requireRole('OWNER')(makeReq(null, 'ws1'), replyArg(reply))
    expect(reply._code).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('400 when workspaceId is missing from params', async () => {
    const reply = makeReply()
    await requireRole('OWNER')(makeReq({ userId: 'u1' }), replyArg(reply))
    expect(reply._code).toBe(400)
  })

  it('403 when the user has no membership in the workspace', async () => {
    findUnique.mockResolvedValue(null)
    const reply = makeReply()
    await requireRole('OWNER')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBe(403)
  })

  it('403 when the membership role is not in the allowed set', async () => {
    findUnique.mockResolvedValue({ role: 'VIEWER' })
    const reply = makeReply()
    await requireRole('OWNER', 'ADMIN')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBe(403)
  })

  it('passes (no status set) when the role is allowed', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' })
    const reply = makeReply()
    await requireRole('OWNER', 'ADMIN')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBeNull()
  })
})

describe('requireMinRole', () => {
  it('passes when the role weight meets the minimum', async () => {
    findUnique.mockResolvedValue({ role: 'EDITOR' })
    const reply = makeReply()
    await requireMinRole('EDITOR')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBeNull()
  })

  it('passes when the role weight exceeds the minimum (OWNER >= EDITOR)', async () => {
    findUnique.mockResolvedValue({ role: 'OWNER' })
    const reply = makeReply()
    await requireMinRole('EDITOR')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBeNull()
  })

  it('403 when the role weight is below the minimum (VIEWER < EDITOR)', async () => {
    findUnique.mockResolvedValue({ role: 'VIEWER' })
    const reply = makeReply()
    await requireMinRole('EDITOR')(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBe(403)
  })
})

describe('named role shorthands', () => {
  it('requireApprovalRole allows APPROVER, blocks EDITOR', async () => {
    findUnique.mockResolvedValue({ role: 'APPROVER' })
    const ok = makeReply()
    await requireApprovalRole(makeReq({ userId: 'u1' }, 'ws1'), replyArg(ok))
    expect(ok._code).toBeNull()

    findUnique.mockResolvedValue({ role: 'EDITOR' })
    const denied = makeReply()
    await requireApprovalRole(makeReq({ userId: 'u1' }, 'ws1'), replyArg(denied))
    expect(denied._code).toBe(403)
  })

  it('requireWriteRole allows AUTHOR, blocks VIEWER and CLIENT', async () => {
    findUnique.mockResolvedValue({ role: 'AUTHOR' })
    const ok = makeReply()
    await requireWriteRole(makeReq({ userId: 'u1' }, 'ws1'), replyArg(ok))
    expect(ok._code).toBeNull()

    for (const role of ['VIEWER', 'CLIENT']) {
      findUnique.mockResolvedValue({ role })
      const denied = makeReply()
      await requireWriteRole(makeReq({ userId: 'u1' }, 'ws1'), replyArg(denied))
      expect(denied._code).toBe(403)
    }
  })

  it('requireReadRole allows even CLIENT (read-only)', async () => {
    findUnique.mockResolvedValue({ role: 'CLIENT' })
    const reply = makeReply()
    await requireReadRole(makeReq({ userId: 'u1' }, 'ws1'), replyArg(reply))
    expect(reply._code).toBeNull()
  })
})
