import { prisma } from '@contento/db'
import { TypedProducer, createKafkaClient, TOPIC_TRENDS } from '@contento/shared'
import type { FetchedTrend } from './fetchers/types.js'

const kafka = createKafkaClient({ clientId: 'trend-fetcher' })
let _producer: TypedProducer | null = null

function getProducer(): TypedProducer {
  if (!_producer) _producer = new TypedProducer(kafka)
  return _producer
}

export function getKafkaProducer(): TypedProducer {
  return getProducer()
}

export async function broadcastTrends(
  source: string,
  trends: FetchedTrend[],
  options: { force?: boolean } = {},
): Promise<void> {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  for (const { id: workspaceId } of workspaces) {
    for (const trend of trends) {
      try {
        // Skip the 24-hour dedup window check when force=true, but still rely on
        // the per-record unique constraint (P2002) to prevent exact duplicates.
        if (!options.force && trend.url) {
          const existing = await prisma.trend.findFirst({
            where: { workspaceId, url: trend.url, discoveredAt: { gte: cutoff } },
            select: { id: true },
          })
          if (existing) continue
        }

        let record: { id: string }
        try {
          record = await prisma.trend.create({
            data: {
              workspaceId,
              title: trend.title,
              ...(trend.url ? { url: trend.url } : {}),
              source,
              status: 'PENDING',
              discoveredAt: new Date(),
            },
            select: { id: true },
          })
        } catch (err) {
          if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
            continue
          }
          throw err
        }

        await getProducer().send(TOPIC_TRENDS, {
          eventId: crypto.randomUUID(),
          workspaceId,
          timestamp: new Date().toISOString(),
          trendId: record.id,
          title: trend.title,
          ...(trend.url ? { url: trend.url } : {}),
          source,
        })
      } catch (err) {
        console.error('[trend-fetcher/publisher] Failed workspace=%s trend=%s: %o', workspaceId, trend.title, err)
      }
    }
  }
}
