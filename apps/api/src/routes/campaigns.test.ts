import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer } from '../server.js'
import type { FastifyInstance } from 'fastify'
import type * as ContentAI from '@contento/ai'

vi.mock('@contento/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof ContentAI>()
  return {
    ...actual,
    generateContentPlan: vi.fn().mockResolvedValue([
      { index: 0, topic: 'Intro video', format: 'reel', scheduledDate: '2026-07-01', hook: 'Stop scrolling if you use spreadsheets' },
      { index: 1, topic: 'Tips video', format: 'reel', scheduledDate: '2026-07-04', hook: 'Did you know 80% of teams waste time here?' },
    ]),
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
    membership: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    mentionSource: { findMany: vi.fn().mockResolvedValue([]) },
    socialAccount: { findMany: vi.fn().mockResolvedValue([]) },
    companyPortrait: {
      findUnique: vi.fn().mockResolvedValue({
        niche: 'SaaS', description: 'Test', usp: 'Best', targetAudience: 'Devs',
        competitors: [], contentAngles: ['Angle 1'],
      }),
    },
    campaign: {
      findMany: vi.fn().mockResolvedValue([{
        id: 'camp1', workspaceId: 'ws1', name: 'Summer Campaign', goal: 'SALES',
        targetAction: 'Book a call', targetPlatforms: ['tiktok', 'instagram', 'youtube', 'telegram'],
        startsAt: new Date('2026-07-01'), endsAt: new Date('2026-07-31'),
        status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), contentPlan: null,
      }]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'camp1', workspaceId: 'ws1', name: 'Summer Campaign', goal: 'SALES',
        targetAction: 'Book a call', targetPlatforms: ['tiktok', 'instagram', 'youtube', 'telegram'],
        startsAt: new Date('2026-07-01'), endsAt: new Date('2026-07-31'),
        status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), contentPlan: null,
      }),
      create: vi.fn().mockResolvedValue({
        id: 'camp1', workspaceId: 'ws1', name: 'Summer Campaign', goal: 'SALES',
        targetAction: 'Book a call', targetPlatforms: ['tiktok', 'instagram', 'youtube', 'telegram'],
        startsAt: new Date('2026-07-01'), endsAt: new Date('2026-07-31'),
        status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({
        id: 'camp1', workspaceId: 'ws1', name: 'Summer Campaign', goal: 'SALES',
        targetAction: 'Book a call', targetPlatforms: ['tiktok', 'instagram', 'youtube', 'telegram'],
        startsAt: new Date('2026-07-01'), endsAt: new Date('2026-07-31'),
        status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
      }),
    },
    contentPlan: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'cp1', campaignId: 'camp1', status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(),
        items: [
          { id: 'i1', index: 0, topic: 'Intro video', format: 'reel', scheduledDate: new Date('2026-07-01'), hook: 'Test hook', status: 'PENDING', rejectComment: null, scriptId: null, videoJobId: null, publicationId: null },
        ],
      }),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    contentPlanItem: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        contentPlan: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: 'cp1', campaignId: 'camp1', status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(),
            items: [
              { id: 'i1', index: 0, topic: 'Intro video', format: 'reel', scheduledDate: new Date('2026-07-01'), hook: 'Test hook', status: 'PENDING', rejectComment: null, scriptId: null, videoJobId: null, publicationId: null },
            ],
          }),
          delete: vi.fn().mockResolvedValue({}),
        },
      }
      return fn(tx)
    }),
  },
}))

describe('Campaigns API', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await createServer(); await app.ready() })
  afterAll(async () => { await app.close() })

  it('GET /workspaces/ws1/campaigns returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/workspaces/ws1/campaigns', headers: { authorization: 'Bearer test' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ items: expect.any(Array) })
  })

  it('POST /workspaces/ws1/campaigns creates campaign', async () => {
    const res = await app.inject({
      method: 'POST', url: '/workspaces/ws1/campaigns',
      headers: { authorization: 'Bearer test' },
      payload: { name: 'Summer Campaign', goal: 'SALES', targetAction: 'Book a call', startsAt: '2026-07-01', endsAt: '2026-07-31' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /workspaces/ws1/campaigns without a company portrait returns 400', async () => {
    const { prisma } = await import('@contento/db')
    vi.mocked(prisma.companyPortrait.findUnique).mockResolvedValueOnce(null)
    const res = await app.inject({
      method: 'POST', url: '/workspaces/ws1/campaigns',
      headers: { authorization: 'Bearer test' },
      payload: { name: 'No Portrait', goal: 'SALES', targetAction: 'Book a call', startsAt: '2026-07-01', endsAt: '2026-07-31' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/portrait/i)
  })

  it('POST /workspaces/ws1/campaigns/camp1/content-plan/generate returns 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/workspaces/ws1/campaigns/camp1/content-plan/generate',
      headers: { authorization: 'Bearer test' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ items: expect.any(Array) })
  })
})
