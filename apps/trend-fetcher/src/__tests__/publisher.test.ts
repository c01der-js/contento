import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FetchedTrend } from '../fetchers/types.js'

const mockCreate = vi.fn()
const mockFindFirst = vi.fn()
const mockFindManyWorkspaces = vi.fn()
vi.mock('@contento/db', () => ({
  prisma: {
    trend: { create: mockCreate, findFirst: mockFindFirst },
    workspace: { findMany: mockFindManyWorkspaces },
  },
}))

const mockSend = vi.fn()
vi.mock('@contento/shared', () => ({
  createKafkaClient: vi.fn().mockReturnValue({}),
  TypedProducer: vi.fn().mockImplementation(() => ({ send: mockSend, disconnect: vi.fn() })),
  TOPIC_TRENDS: 'trends',
}))

describe('broadcastTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockFindManyWorkspaces.mockResolvedValue([{ id: 'ws-aaa' }, { id: 'ws-bbb' }])
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'cltest123abc456' })
  })

  it('broadcasts each trend to all workspaces', async () => {
    const { broadcastTrends } = await import('../publisher.js')
    const trends: FetchedTrend[] = [
      { title: 'Trend A', url: 'https://example.com/a' },
    ]
    await broadcastTrends('rss', trends)

    // 2 workspaces × 1 trend = 2 DB creates + 2 Kafka events
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(
      'trends',
      expect.objectContaining({ workspaceId: 'ws-aaa', title: 'Trend A', source: 'rss' })
    )
    expect(mockSend).toHaveBeenCalledWith(
      'trends',
      expect.objectContaining({ workspaceId: 'ws-bbb', title: 'Trend A', source: 'rss' })
    )
  })

  it('skips workspace where URL was already seen in last 24h', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'existing' }) // ws-aaa: dup
      .mockResolvedValueOnce(null)               // ws-bbb: new
    const { broadcastTrends } = await import('../publisher.js')
    await broadcastTrends('rss', [{ title: 'Dup', url: 'https://example.com/dup' }])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith('trends', expect.objectContaining({ workspaceId: 'ws-bbb' }))
  })

  it('skips dedup check for trends without URL', async () => {
    const { broadcastTrends } = await import('../publisher.js')
    await broadcastTrends('google_trends', [{ title: 'No URL trend' }])
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(2) // both workspaces
  })
})
