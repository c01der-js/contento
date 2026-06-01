import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer } from '../server.js'
import type { FastifyInstance } from 'fastify'

vi.mock('@contento/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contento/ai')>()
  return {
    ...actual,
    analyzeCompany: vi.fn().mockResolvedValue({
      niche: 'SaaS tools',
      description: 'Test company',
      usp: 'Best product',
      targetAudience: 'Developers',
      competitors: ['Competitor A'],
      contentAngles: ['Angle 1', 'Angle 2'],
    }),
  }
})

vi.mock('../middleware/rbac.js', () => ({
  requireRole: () => async () => {},
  requireMinRole: () => async () => {},
  requireWriteRole: async () => {},
  requireReadRole: async () => {},
  requireApprovalRole: async () => {},
}))

vi.mock('@contento/db', () => ({
  prisma: {
    membership: {
      findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }),
    },
    companyPortrait: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'cp1',
        workspaceId: 'ws1',
        niche: 'SaaS tools',
        description: 'Test company',
        usp: 'Best product',
        targetAudience: 'Developers',
        competitors: ['Competitor A'],
        contentAngles: ['Angle 1', 'Angle 2'],
        rawInput: {},
        generatedAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    mentionSource: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    socialAccount: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

describe('Company Portrait API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createServer()
    await app.ready()
  })

  afterAll(async () => { await app.close() })

  it('GET /workspaces/ws1/company-portrait returns 200 with null when no portrait', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/workspaces/ws1/company-portrait',
      headers: { authorization: 'Bearer test' },
    })
    expect(response.statusCode).toBe(200)
  })

  it('POST /workspaces/ws1/company-portrait/generate returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/workspaces/ws1/company-portrait/generate',
      headers: { authorization: 'Bearer test' },
      payload: {
        companyName: 'TestCo',
        niche: 'SaaS',
        description: 'We make tools',
        usp: 'Best UX',
        targetAudience: 'SMBs',
        competitors: [],
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ niche: 'SaaS tools' })
  })
})
