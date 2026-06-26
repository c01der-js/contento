import { prisma } from '@contento/db'
import { startWorker } from './worker.js'

const worker = startWorker()

worker.on('failed', (job, err) => {
  console.error(`[instagram-agent] job ${job?.id} failed:`, err)
})

async function shutdown(): Promise<void> {
  console.log('[instagram-agent] Shutting down...')
  try {
    await worker.close()
  } catch (err) {
    console.error('[instagram-agent] Error closing worker:', err)
  }
  try {
    await prisma.$disconnect()
  } catch (err) {
    console.error('[instagram-agent] Error disconnecting prisma:', err)
  }
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})
process.on('SIGINT', () => {
  void shutdown()
})

console.log('[instagram-agent] Started, consuming the instagram-dm queue')
