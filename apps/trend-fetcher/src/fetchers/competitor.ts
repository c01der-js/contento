import { prisma } from '@contento/db'
import Parser from 'rss-parser'
import type { FetchedTrend } from './types.js'

const parser = new Parser()

/**
 * Fetches trends from competitor URLs via RSS.
 * Loads all Competitor records (optionally filtered by workspaceId),
 * attempts RSS parse on competitor.url, and returns FetchedTrend[].
 * source='competitor' is set by the caller (broadcastTrends).
 */
export async function fetchCompetitorTrends(workspaceId?: string): Promise<FetchedTrend[]> {
  const competitors = await prisma.competitor.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      url: { not: null },
    },
    select: { id: true, name: true, url: true },
  })

  const results: FetchedTrend[] = []

  for (const competitor of competitors) {
    if (!competitor.url) continue
    try {
      const feed = await parser.parseURL(competitor.url)
      const items = feed.items
        .filter((item) => Boolean(item.title))
        .map((item) => ({
          title: `[${competitor.name}] ${item.title!}`,
          ...(item.link ? { url: item.link } : {}),
          ...(item.contentSnippet ? { description: item.contentSnippet } : {}),
        }))
      results.push(...items)
    } catch (err) {
      console.error(
        '[trend-fetcher/competitor] Error fetching competitor=%s url=%s: %o',
        competitor.name,
        competitor.url,
        err,
      )
      // Continue with other competitors — per-competitor error isolation
    }
  }

  return results
}
