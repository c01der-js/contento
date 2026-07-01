import { Queue, Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { TrendSourceSchema } from '@contento/shared'
import { fetchRss } from './fetchers/rss.js'
import { fetchReddit } from './fetchers/reddit.js'
import { fetchGoogleTrends } from './fetchers/google-trends.js'
import { fetchYouTube } from './fetchers/youtube.js'
import { fetchCompetitorTrends } from './fetchers/competitor.js'
import { fetchTikTokTrends } from './fetchers/tiktok.js'
import { fetchXTrends } from './fetchers/x.js'
import { fetchVirloTrends } from './fetchers/virlo.js'
import { broadcastTrends } from './publisher.js'
import type { RssConfig, RedditConfig, GoogleTrendsConfig, YouTubeConfig, VirloConfig } from './fetchers/types.js'

const QUEUE_NAME = 'trend-fetch'
const REPEAT_EVERY_MS = 30 * 60 * 1000
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const TREND_FETCH_QUEUE_NAME = QUEUE_NAME

let _redis: IORedis | null = null
function getRedis() {
  if (!_redis) _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  return _redis
}

export const queue = new Queue(QUEUE_NAME, { connection: getRedis() })

export async function scheduleRepeatableJob(): Promise<void> {
  await queue.upsertJobScheduler(
    'fetch-all-trends',
    { every: REPEAT_EVERY_MS },
    { name: 'fetch-all-trends', data: {} },
  )
}

// Default, key-free trend sources so a fresh install produces trends out of the box.
// TrendFeedConfig is global (not per-workspace); the fetcher reads enabled rows and
// broadcastTrends fans results out to every workspace. RU-market feeds (reg. market =
// RU-speaking diaspora + CIS). Users add/remove sources later via Settings → Trend Sources.
const DEFAULT_TREND_SOURCES: Array<{ source: string; config: Record<string, unknown> }> = [
  { source: 'rss', config: { url: 'https://news.google.com/rss?hl=ru&gl=RU&ceid=RU:ru' } },
  { source: 'rss', config: { url: 'https://lenta.ru/rss/news' } },
]

/**
 * Seed the default sources only when the table is completely empty (never seeded).
 * Idempotent across restarts; won't resurrect sources a user deliberately deleted
 * (any remaining row — even disabled — suppresses re-seeding). Non-fatal on error.
 */
export async function seedDefaultTrendSources(): Promise<void> {
  try {
    const existing = await prisma.trendFeedConfig.count()
    if (existing > 0) return
    await prisma.trendFeedConfig.createMany({
      data: DEFAULT_TREND_SOURCES.map((s) => ({ source: s.source, config: s.config as object, enabled: true })),
    })
    console.log('[trend-fetcher] Seeded %d default trend sources (table was empty).', DEFAULT_TREND_SOURCES.length)
  } catch (err) {
    console.error('[trend-fetcher] Failed to seed default trend sources: %o', err)
  }
}

export function createWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const force = (job.data as { force?: boolean }).force === true

      const configs = await prisma.trendFeedConfig.findMany({
        where: { enabled: true },
        select: { source: true, config: true },
      })

      for (const { source, config } of configs) {
        const parsedSource = TrendSourceSchema.safeParse(source)
        if (!parsedSource.success) {
          console.error('[trend-fetcher] Invalid source in TrendFeedConfig: %s', source)
          continue
        }
        try {
          switch (source) {
            case 'rss': {
              const trends = await fetchRss(config as unknown as RssConfig)
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'reddit': {
              const trends = await fetchReddit(config as unknown as RedditConfig)
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'google_trends': {
              const trends = await fetchGoogleTrends(config as unknown as GoogleTrendsConfig)
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'youtube': {
              const trends = await fetchYouTube(config as unknown as YouTubeConfig)
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'competitor': {
              const trends = await fetchCompetitorTrends()
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'tiktok': {
              const trends = await fetchTikTokTrends()
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'x': {
              const trends = await fetchXTrends()
              await broadcastTrends(source, trends, { force })
              break
            }
            case 'virlo': {
              const trends = await fetchVirloTrends(config as unknown as VirloConfig)
              await broadcastTrends(source, trends, { force })
              break
            }
            default:
              console.warn('[trend-fetcher] Unknown source: %s', source)
          }
        } catch (err) {
          console.error('[trend-fetcher] Failed config source=%s: %o', source, err)
        }
      }
    },
    { connection: getRedis() },
  )
}
