import { syncScheduledJobs, createWorker, queue, getProducer } from './worker.js'
import { createDigestQueue, createDigestWorker, registerDigestJobs } from './digest.js'
import { prisma } from '@contento/db'
import { Redis as IORedis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

async function main() {
  console.log('Scheduler starting...')

  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

  await syncScheduledJobs()
  const worker = createWorker()

  // Digest jobs
  const digestQueue = createDigestQueue(redis)
  await registerDigestJobs(digestQueue)
  const digestWorker = createDigestWorker(redis)

  // Re-sync every 60 seconds to catch newly created scheduled publications
  const syncInterval = setInterval(syncScheduledJobs, 60_000)

  // Graceful shutdown
  async function shutdown() {
    clearInterval(syncInterval)
    await worker.close()
    await digestWorker.close()
    await queue.close()
    await digestQueue.close()
    try {
      await getProducer().disconnect()
    } catch {}
    await prisma.$disconnect()
    redis.disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.log('Scheduler running.')
}

main().catch((err) => {
  console.error('Scheduler failed to start:', err)
  process.exit(1)
})
