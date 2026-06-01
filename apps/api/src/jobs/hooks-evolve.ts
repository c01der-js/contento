import { Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { clickhouseQuery } from '../clickhouse.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

type ClickHouseRow = { workspace_id: string; top_hook: string; cnt: string }

export function startHooksEvolveWorker(): Worker {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  return new Worker('hooks-evolve', async (job) => {
    const { workspaceId } = job.data as { workspaceId: string }

    if (!workspaceId || typeof workspaceId !== 'string') throw new Error('Invalid workspaceId in job data')

    const rows = await clickhouseQuery<ClickHouseRow>(
      `SELECT workspace_id, platform AS top_hook, count() AS cnt
       FROM publication_events
       WHERE workspace_id = {workspaceId:String}
         AND published_at >= now() - INTERVAL 30 DAY
       GROUP BY workspace_id, platform
       ORDER BY cnt DESC
       LIMIT 20`,
      { workspaceId },
    ).catch((err) => { console.error('[hooks-evolve] ClickHouse query failed:', err); return [] as ClickHouseRow[] })

    for (const row of rows) {
      const hookText = `Best performing content: ${row.top_hook}`
      const existing = await prisma.hook.findFirst({
        where: { workspaceId, text: hookText, source: 'auto' },
      })
      if (existing) {
        await prisma.hook.update({
          where: { id: existing.id },
          data: {
            publicationCount: Number(row.cnt),
            performanceScore: (() => { const rawCnt = Number(row.cnt); return Number.isFinite(rawCnt) ? Math.min(rawCnt / 10, 100) : 0 })(),
            lastSeenAt: new Date(),
          },
        })
      } else {
        await prisma.hook.create({
          data: {
            workspaceId,
            text: hookText,
            source: 'auto',
            publicationCount: Number(row.cnt),
            performanceScore: (() => { const rawCnt = Number(row.cnt); return Number.isFinite(rawCnt) ? Math.min(rawCnt / 10, 100) : 0 })(),
            lastSeenAt: new Date(),
          },
        })
      }
    }
  }, { connection })
}
