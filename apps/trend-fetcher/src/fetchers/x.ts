import type { FetchedTrend } from './types.js'

interface XTrend {
  name: string
  url?: string
  query?: string
  tweet_volume: number | null
}

interface XTrendsResponse {
  [0]: {
    trends: XTrend[]
  }
}

// X trends are global, scoped by X_TRENDS_WOEID (a place id), not by workspace. Like the
// other fetchers, trends are fetched globally and scored per-workspace downstream in
// trend-analyzer, so no workspace arg is threaded here.
export async function fetchXTrends(): Promise<FetchedTrend[]> {
  const bearerToken = process.env.X_BEARER_TOKEN
  if (!bearerToken) {
    console.warn('[trend-fetcher/x] X_BEARER_TOKEN not set, skipping')
    return []
  }

  const woeid = process.env.X_TRENDS_WOEID ?? '1'
  const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error('[trend-fetcher/x] HTTP %d for woeid=%s', res.status, woeid)
      return []
    }

    const data = (await res.json()) as XTrendsResponse

    const trends = data[0]?.trends
    if (!Array.isArray(trends)) {
      console.warn('[trend-fetcher/x] Unexpected response shape')
      return []
    }

    return trends
      .filter((t) => Boolean(t.name))
      .map((t) => ({
        title: t.name,
        ...(t.url ? { url: t.url } : {}),
        source: 'x',
        sourceMetadata: {
          volume: t.tweet_volume,
        },
      }))
  } catch (err) {
    console.error('[trend-fetcher/x] Error for woeid=%s: %o', woeid, err)
    return []
  }
}
