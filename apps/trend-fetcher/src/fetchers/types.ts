export interface FetchedTrend {
  title: string
  url?: string
  description?: string
}

export interface RssConfig {
  url: string
}

export interface RedditConfig {
  subreddit: string
  limit?: number
}

export interface GoogleTrendsConfig {
  geo?: string
}

export interface YouTubeConfig {
  query: string
  maxResults?: number
}

export interface VirloConfig {
  /** Freeform niche description sent to Virlo orbit search */
  niche: string
  /** Max videos to return (default 10, max 50) */
  limit?: number
  /** ISO-3166-1 alpha-2 country code filter, e.g. "US" */
  country?: string
}
