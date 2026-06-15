import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above const declarations, so mock fns must be created via
// vi.hoisted() (same pattern used elsewhere in this repo's tests).
const { mockAdd, mockFindMany, mockAccountFindMany } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockFindMany: vi.fn(),
  mockAccountFindMany: vi.fn(),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    add = mockAdd
  },
  Worker: class {},
}))
vi.mock('ioredis', () => ({ Redis: class {} }))
vi.mock('@contento/shared', () => ({
  createKafkaClient: () => ({}),
  TypedProducer: class {
    send = vi.fn()
  },
  TOPIC_PUBLISH: 'publish',
}))
vi.mock('@contento/db', () => ({
  prisma: {
    publication: { findMany: mockFindMany },
    socialAccount: { findMany: mockAccountFindMany },
  },
}))

import { syncScheduledJobs } from './worker.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncScheduledJobs', () => {
  it('includes platform in the enqueued job data', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'pub1', workspaceId: 'ws1', socialAccountId: 'acc1', scheduledAt: new Date('2099-01-01T00:00:00Z') },
    ])
    mockAccountFindMany.mockResolvedValue([{ id: 'acc1', platform: 'telegram' }])

    await syncScheduledJobs()

    expect(mockAdd).toHaveBeenCalledTimes(1)
    const [, data] = mockAdd.mock.calls[0] as [string, Record<string, unknown>]
    expect(data.platform).toBe('telegram')
    expect(data.publicationId).toBe('pub1')
  })
})
