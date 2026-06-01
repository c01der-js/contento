import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchReddit } from '../fetchers/reddit.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('fetchReddit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { title: 'Hot Post One', url: 'https://reddit.com/r/tech/1', selftext: 'Summary one' } },
            { data: { title: 'Hot Post Two', url: 'https://reddit.com/r/tech/2', selftext: '' } },
            { data: { title: '', url: 'https://reddit.com/3', selftext: '' } }, // no title — skip
          ],
        },
      }),
    })
  })

  it('returns top posts from subreddit', async () => {
    const results = await fetchReddit({ subreddit: 'technology', limit: 10 })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.reddit.com/r/technology/hot.json?limit=10',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Hot Post One', url: 'https://reddit.com/r/tech/1', description: 'Summary one' })
    expect(results[1]).toEqual({ title: 'Hot Post Two', url: 'https://reddit.com/r/tech/2' })
  })

  it('uses default limit of 25', async () => {
    await fetchReddit({ subreddit: 'technology' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.reddit.com/r/technology/hot.json?limit=25',
      expect.any(Object)
    )
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await fetchReddit({ subreddit: 'technology' })).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    expect(await fetchReddit({ subreddit: 'technology' })).toEqual([])
  })
})
