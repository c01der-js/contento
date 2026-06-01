import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchYouTube } from '../fetchers/youtube.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('fetchYouTube', () => {
  const originalKey = process.env.YOUTUBE_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.YOUTUBE_API_KEY = 'test-api-key'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { snippet: { title: 'Video One', description: 'Desc one' }, id: { videoId: 'abc123' } },
          { snippet: { title: 'Video Two', description: '' }, id: { videoId: 'def456' } },
        ],
      }),
    })
  })

  afterEach(() => {
    process.env.YOUTUBE_API_KEY = originalKey
  })

  it('returns search results as FetchedTrend list', async () => {
    const results = await fetchYouTube({ query: 'AI trends', maxResults: 5 })
    const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string)
    expect(calledUrl.hostname).toBe('www.googleapis.com')
    expect(calledUrl.searchParams.get('q')).toBe('AI trends')
    expect(calledUrl.searchParams.get('maxResults')).toBe('5')
    expect(calledUrl.searchParams.get('key')).toBe('test-api-key')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Video One', url: 'https://www.youtube.com/watch?v=abc123', description: 'Desc one' })
    expect(results[1]).toEqual({ title: 'Video Two', url: 'https://www.youtube.com/watch?v=def456' })
  })

  it('returns empty array when YOUTUBE_API_KEY is not set', async () => {
    delete process.env.YOUTUBE_API_KEY
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
  })
})
