import {
  TypedConsumer,
  TypedProducer,
  createKafkaClient,
  TOPIC_TRENDS,
  TOPIC_TRENDS_ANALYZED,
  TrendDiscoveredSchema,
} from '@contento/shared'
import { prisma } from '@contento/db'
import { analyzeTrend } from '@contento/ai'

const kafka = createKafkaClient({ clientId: 'trend-analyzer' })
let _producer: TypedProducer | null = null

function getProducer(): TypedProducer {
  if (!_producer) {
    _producer = new TypedProducer(kafka)
  }
  return _producer
}

export function getKafkaProducer(): TypedProducer {
  return getProducer()
}

export function createWorkerConsumer(): TypedConsumer {
  return new TypedConsumer(kafka, 'trend-analyzer')
}

export async function runWorker(consumer: TypedConsumer): Promise<void> {
  await consumer.subscribe([TOPIC_TRENDS])

  await consumer.run<unknown>(async (_topic, rawPayload) => {
    let trendId: string | undefined
    try {
      const event = TrendDiscoveredSchema.parse(rawPayload)
      trendId = event.trendId
      const { workspaceId, title, timestamp, source } = event
      const url = event.url

      // Upsert the trend in DB
      const existing = await prisma.trend.upsert({
        where: { id: trendId },
        create: {
          id: trendId,
          workspaceId,
          title,
          ...(url ? { url } : {}),
          source,
          status: 'PENDING',
          discoveredAt: new Date(timestamp),
        },
        update: {
          title,
          ...(url ? { url } : {}),
        },
        select: { relevanceScore: true, velocityScoreHistory: true },
      })

      // Snapshot prior score for velocity tracking
      const priorScore = existing.relevanceScore ?? null

      // Fetch user feedback signals for re-ranking
      const feedbacks = await prisma.trendFeedback.findMany({
        where: { trendId },
        select: { signal: true },
      })
      const interestingCount = feedbacks.filter((f) => f.signal === 'INTERESTING').length
      const notRelevantCount = feedbacks.filter((f) => f.signal === 'NOT_RELEVANT').length
      const feedbackBonus = interestingCount * 10 - notRelevantCount * 20

      // Run the trend analyzer
      const result = await analyzeTrend(workspaceId, {
        title,
        ...(event.url ? { url: event.url } : {}),
      })

      // US-010: handle FILTERED result
      if (result.category === 'FILTERED') {
        await prisma.trend.update({
          where: { id: trendId },
          data: { status: 'FILTERED' },
        })
        return
      }

      // US-012: apply feedback re-ranking, clamped to [0, 100]
      let rawScore = Number.isFinite(result.score) ? Math.round(result.score) : null
      if (rawScore !== null) {
        rawScore = Math.max(0, Math.min(100, rawScore + feedbackBonus))
      }
      const score = rawScore

      // US-011: build velocity history (append current score snapshot)
      let velocityHistory: number[] = []
      const storedHistory = existing.velocityScoreHistory
      if (Array.isArray(storedHistory)) {
        velocityHistory = storedHistory as number[]
      }
      if (priorScore !== null) {
        velocityHistory = [...velocityHistory, priorScore].slice(-10) // keep last 10 snapshots
      }

      // Update trend with analysis results
      await prisma.trend.update({
        where: { id: trendId },
        data: {
          relevanceScore: score,
          ...(result.category ? { category: result.category } : {}),
          ...(result.lifecycle ? { lifecycle: result.lifecycle } : {}),
          ...(velocityHistory.length > 0 ? { velocityScoreHistory: velocityHistory } : {}),
          status: 'ANALYZED',
        },
      })

      // Emit TrendAnalyzed event
      await getProducer().send(TOPIC_TRENDS_ANALYZED, {
        eventId: crypto.randomUUID(),
        workspaceId,
        timestamp: new Date().toISOString(),
        trendId,
        score: result.score,
        summary: result.summary,
        ...(result.category ? { category: result.category } : {}),
      })
    } catch (err) {
      console.error('[trend-analyzer] Failed to process trend %s: %o', trendId ?? 'unknown', err)
      // never re-throw — always ack
    }
  })
}
