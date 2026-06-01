import { prisma } from '@contento/db'
import { createWorkerConsumer, getKafkaProducer, runWorker } from './worker.js'

const consumer = createWorkerConsumer()

async function shutdown(): Promise<void> {
  console.log('[posting-service] Shutting down...')
  try {
    await consumer.disconnect()
  } catch (err) {
    console.error('[posting-service] Error disconnecting consumer:', err)
  }
  try {
    const producer = getKafkaProducer()
    await producer.disconnect()
  } catch (err) {
    console.error('[posting-service] Error disconnecting producer:', err)
  }
  try {
    await prisma.$disconnect()
  } catch (err) {
    console.error('[posting-service] Error disconnecting prisma:', err)
  }
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT', () => { void shutdown() })

console.log('[posting-service] Starting...')
runWorker(consumer).catch((err) => {
  console.error('[posting-service] Fatal error:', err)
  process.exit(1)
})
