import type { FetchedTrend, RedditConfig } from './types.js'

interface RedditPost {
  data: { title: string; url: string; selftext?: string }
}

interface RedditResponse {
  data: { children: RedditPost[] }
}

export async function fetchReddit(config: RedditConfig): Promise<FetchedTrend[]> {
  const limit = config.limit ?? 25
  const url = `https://www.reddit.com/r/${config.subreddit}/hot.json?limit=${limit}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'trend-fetcher/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[trend-fetcher/reddit] HTTP %d for r/%s', res.status, config.subreddit)
      return []
    }
    const data = (await res.json()) as RedditResponse
    return data.data.children
      .filter((c) => Boolean(c.data.title))
      .map((c) => ({
        title: c.data.title,
        url: c.data.url,
        ...(c.data.selftext ? { description: c.data.selftext } : {}),
      }))
  } catch (err) {
    console.error('[trend-fetcher/reddit] Error for r/%s: %o', config.subreddit, err)
    return []
  }
}
