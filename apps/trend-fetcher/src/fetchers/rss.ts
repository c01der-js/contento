import Parser from 'rss-parser'
import type { FetchedTrend, RssConfig } from './types.js'

const parser = new Parser()

export async function fetchRss(config: RssConfig): Promise<FetchedTrend[]> {
  try {
    const feed = await parser.parseURL(config.url)
    return feed.items
      .filter((item) => Boolean(item.title))
      .map((item) => ({
        title: item.title!,
        ...(item.link ? { url: item.link } : {}),
        ...(item.contentSnippet ? { description: item.contentSnippet } : {}),
      }))
  } catch (err) {
    console.error('[trend-fetcher/rss] Error fetching %s: %o', config.url, err)
    return []
  }
}
