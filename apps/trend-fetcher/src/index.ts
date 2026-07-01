import { prisma } from '@contento/db'
import { scheduleRepeatableJob, createWorker, queue, seedDefaultTrendSources } from './worker.js'
import { getKafkaProducer } from './publisher.js'

async function main() {
  console.log('[trend-fetcher] Starting...')
  await seedDefaultTrendSources()
  await scheduleRepeatableJob()
  const worker = createWorker()

  async function shutdown() {
    await worker.close()
    await queue.close()
    try { await getKafkaProducer().disconnect() } catch {}
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })

  console.log('[trend-fetcher] Running. Fetches every 30 minutes.')
}

main().catch((err) => {
  console.error('[trend-fetcher] Fatal:', err)
  process.exit(1)
})
