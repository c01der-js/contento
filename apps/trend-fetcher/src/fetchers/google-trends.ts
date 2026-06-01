import googleTrends from 'google-trends-api'
import type { FetchedTrend, GoogleTrendsConfig } from './types.js'

interface TrendingSearch {
  title: { query: string }
  articles: { url: string }[]
}

interface DailyTrendsResponse {
  default: {
    trendingSearchesDays: { trendingSearches: TrendingSearch[] }[]
  }
}

export async function fetchGoogleTrends(config: GoogleTrendsConfig): Promise<FetchedTrend[]> {
  try {
    const raw = await googleTrends.dailyTrends({ geo: config.geo ?? 'US' })
    const data: DailyTrendsResponse = JSON.parse(raw as string)
    const searches = data.default.trendingSearchesDays[0]?.trendingSearches ?? []
    return searches.map((s) => ({
      title: s.title.query,
      ...(s.articles[0]?.url ? { url: s.articles[0].url } : {}),
    }))
  } catch (err) {
    console.error('[trend-fetcher/google-trends] Error: %o', err)
    return []
  }
}
