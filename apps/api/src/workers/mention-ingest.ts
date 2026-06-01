import { prisma } from '@contento/db'
import Parser from 'rss-parser'

const parser = new Parser()
const POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Build a Google News RSS search URL for a given query string.
 */
function googleNewsRssUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`
}

/**
 * Poll RSS feeds for brand mentions for all workspaces.
 * Uses Competitor.notes as comma-separated keywords (fallback: workspace name via competitor.name).
 * Creates Mention records, deduplicating on [workspaceId, url].
 */
export async function pollMentions(): Promise<void> {
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      competitors: {
        select: { id: true, name: true, notes: true },
      },
    },
  })

  for (const workspace of workspaces) {
    // Build keyword list: workspace name + keywords from competitor notes
    const keywordSet = new Set<string>()
    keywordSet.add(workspace.name)

    for (const competitor of workspace.competitors) {
      if (competitor.notes) {
        competitor.notes
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
          .forEach((k) => keywordSet.add(k))
      }
    }

    for (const keyword of keywordSet) {
      const feedUrl = googleNewsRssUrl(keyword)
      try {
        const feed = await parser.parseURL(feedUrl)
        for (const item of feed.items) {
          if (!item.link || !item.title) continue
          try {
            await prisma.mention.upsert({
              where: { workspaceId_url: { workspaceId: workspace.id, url: item.link } },
              create: {
                workspaceId: workspace.id,
                source: 'google_news_rss',
                url: item.link,
                text: item.title,
                sentiment: 'neutral',
                urgency: 1,
                summary: item.contentSnippet ?? null,
                seenAt: item.pubDate ? new Date(item.pubDate) : new Date(),
              },
              update: {},
            })
          } catch (err) {
            console.error(
              '[mention-ingest] Upsert failed workspace=%s url=%s: %o',
              workspace.id,
              item.link,
              err,
            )
          }
        }
      } catch (err) {
        console.error(
          '[mention-ingest] RSS fetch failed workspace=%s keyword=%s: %o',
          workspace.id,
          keyword,
          err,
        )
      }
    }
  }
}

/**
 * Start the mention poller as a setInterval background process.
 * Returns a cleanup function to stop polling.
 */
export function startMentionPoller(): () => void {
  console.log('[mention-ingest] Starting poller (interval=%dms)', POLL_INTERVAL_MS)

  // Run once immediately on startup
  pollMentions().catch((err) => {
    console.error('[mention-ingest] Initial poll failed: %o', err)
  })

  const handle = setInterval(() => {
    pollMentions().catch((err) => {
      console.error('[mention-ingest] Poll failed: %o', err)
    })
  }, POLL_INTERVAL_MS)

  return () => clearInterval(handle)
}
