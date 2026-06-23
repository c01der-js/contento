import type { FetchedTrend } from './types.js'

interface TikTokTrendItem {
  item_id?: string
  desc?: string
  author?: { uniqueId?: string }
  stats?: { playCount?: number; diggCount?: number }
}

interface TikTokApiResponse {
  data?: {
    list?: TikTokTrendItem[]
  }
  status_code?: number
}

// TikTok Creative Radar is a global API keyed by a single TIKTOK_API_KEY — there is no
// per-workspace dimension. Trends are fetched once globally and scored per-workspace
// downstream in trend-analyzer (relevance vs each workspace's pillars), so no workspace
// arg is threaded here.
export async function fetchTikTokTrends(): Promise<FetchedTrend[]> {
  const apiKey = process.env.TIKTOK_API_KEY
  if (!apiKey) {
    console.warn('[trend-fetcher/tiktok] TIKTOK_API_KEY not set, skipping')
    return []
  }

  const url = new URL('https://ads.tiktok.com/creative_radar_api/v1/trend_data/list')
  url.searchParams.set('period', '7')
  url.searchParams.set('page', '1')
  url.searchParams.set('limit', '20')

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Access-Token': apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.error('[trend-fetcher/tiktok] HTTP %d', res.status)
      return []
    }

    const data = (await res.json()) as TikTokApiResponse

    if (data.status_code !== 0 || !data.data?.list) {
      console.warn('[trend-fetcher/tiktok] Unexpected response shape: status_code=%s', data.status_code)
      return []
    }

    return data.data.list
      .filter((item) => Boolean(item.desc))
      .map((item) => ({
        title: item.desc!,
        ...(item.item_id
          ? { url: `https://www.tiktok.com/@${item.author?.uniqueId ?? 'unknown'}/video/${item.item_id}` }
          : {}),
        source: 'tiktok',
        sourceMetadata: {
          playCount: item.stats?.playCount ?? null,
          diggCount: item.stats?.diggCount ?? null,
        },
      }))
  } catch (err) {
    console.error('[trend-fetcher/tiktok] Error: %o', err)
    return []
  }
}
