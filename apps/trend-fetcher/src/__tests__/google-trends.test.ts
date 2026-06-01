import { describe, it, expect, vi } from 'vitest'
import { fetchGoogleTrends } from '../fetchers/google-trends.js'

vi.mock('google-trends-api', () => ({
  default: { dailyTrends: vi.fn() },
}))

describe('fetchGoogleTrends', () => {
  it('returns trending topics', async () => {
    const { default: googleTrends } = await import('google-trends-api')
    vi.mocked(googleTrends.dailyTrends).mockResolvedValue(
      JSON.stringify({
        default: {
          trendingSearchesDays: [{
            trendingSearches: [
              { title: { query: 'AI breakthrough' }, articles: [{ url: 'https://news.example.com/ai' }] },
              { title: { query: 'Climate news' }, articles: [] },
            ],
          }],
        },
      })
    )

    const results = await fetchGoogleTrends({ geo: 'US' })
    expect(vi.mocked(googleTrends.dailyTrends)).toHaveBeenCalledWith({ geo: 'US' })
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'AI breakthrough', url: 'https://news.example.com/ai' })
    expect(results[1]).toEqual({ title: 'Climate news' })
  })

  it('returns empty array on API error', async () => {
    const { default: googleTrends } = await import('google-trends-api')
    vi.mocked(googleTrends.dailyTrends).mockRejectedValue(new Error('API error'))
    expect(await fetchGoogleTrends({ geo: 'US' })).toEqual([])
  })
})
