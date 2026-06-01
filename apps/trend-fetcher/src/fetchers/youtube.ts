import type { FetchedTrend, YouTubeConfig } from './types.js'

interface YouTubeItem {
  snippet: { title: string; description: string }
  id: { videoId: string }
}

interface YouTubeResponse {
  items: YouTubeItem[]
}

export async function fetchYouTube(config: YouTubeConfig): Promise<FetchedTrend[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('[trend-fetcher/youtube] YOUTUBE_API_KEY not set, skipping')
    return []
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', config.query)
  url.searchParams.set('type', 'video')
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('maxResults', String(config.maxResults ?? 10))
  url.searchParams.set('key', apiKey)

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      console.error('[trend-fetcher/youtube] HTTP %d for query "%s"', res.status, config.query)
      return []
    }
    const data = (await res.json()) as YouTubeResponse
    return data.items.map((item) => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      ...(item.snippet.description ? { description: item.snippet.description } : {}),
    }))
  } catch (err) {
    console.error('[trend-fetcher/youtube] Error for query "%s": %o', config.query, err)
    return []
  }
}
