import { Queue, Worker } from 'bullmq'
import type { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'

const DIGEST_QUEUE_NAME = 'digest'

export function createDigestQueue(redis: IORedis): Queue {
  return new Queue(DIGEST_QUEUE_NAME, { connection: redis })
}

/**
 * Register repeatable digest jobs:
 *   - daily-digest:  every day at 09:00
 *   - weekly-digest: every Monday at 09:00
 */
export async function registerDigestJobs(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'daily-digest',
    { pattern: '0 9 * * *' },
    { name: 'daily-digest', data: { type: 'daily' } },
  )

  await queue.upsertJobScheduler(
    'weekly-digest',
    { pattern: '0 9 * * 1' },
    { name: 'weekly-digest', data: { type: 'weekly' } },
  )
}

async function processDigest(): Promise<void> {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
  })

  for (const { id: workspaceId } of workspaces) {
    try {
      // Fetch top-10 ANALYZED trends ordered by relevance score
      const topTrends = await prisma.trend.findMany({
        where: { workspaceId, status: 'ANALYZED' },
        orderBy: { relevanceScore: { sort: 'desc', nulls: 'last' } },
        take: 10,
        select: { id: true, title: true },
      })

      if (topTrends.length === 0) continue

      const top10TrendTitles = topTrends.map((t) => t.title)

      // Find OWNER and ADMIN members of this workspace
      const members = await prisma.membership.findMany({
        where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      })

      if (members.length === 0) continue

      // Create a Notification for each qualifying member
      await prisma.notification.createMany({
        data: members.map(({ userId }) => ({
          workspaceId,
          userId,
          type: 'TREND_DIGEST' as const,
          title: 'Your trend digest',
          body: JSON.stringify(top10TrendTitles),
        })),
      })
    } catch (err) {
      console.error('[scheduler/digest] Failed workspace=%s: %o', workspaceId, err)
    }
  }
}

export function createDigestWorker(redis: IORedis): Worker {
  return new Worker(
    DIGEST_QUEUE_NAME,
    async () => {
      await processDigest()
    },
    { connection: redis },
  )
}
