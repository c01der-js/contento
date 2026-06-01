import { prisma } from '@contento/db'
import { createWorkerConsumer, getKafkaProducer, runWorker } from './worker.js'

const consumer = createWorkerConsumer()

async function shutdown(): Promise<void> {
  console.log('[trend-analyzer] Shutting down...')
  try {
    await consumer.disconnect()
  } catch (err) {
    console.error('[trend-analyzer] Error disconnecting consumer:', err)
  }
  try {
    const producer = getKafkaProducer()
    await producer.disconnect()
  } catch (err) {
    console.error('[trend-analyzer] Error disconnecting producer:', err)
  }
  try {
    await prisma.$disconnect()
  } catch (err) {
    console.error('[trend-analyzer] Error disconnecting prisma:', err)
  }
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })

console.log('[trend-analyzer] Starting...')
runWorker(consumer).catch((err) => {
  console.error('[trend-analyzer] Fatal error:', err)
  process.exit(1)
})
