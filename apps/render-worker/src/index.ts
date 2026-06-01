import { createWorker } from './worker.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const worker = createWorker(REDIS_URL)

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed: ${result.outputUrl}`)
})

worker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message)
  if (job?.data.renderJobId) {
    const { prisma } = await import('@contento/db')
    await prisma.renderJob
      .update({
        where: { id: job.data.renderJobId },
        data: { status: 'FAILED', errorMessage: err.message },
      })
      .catch(() => {})
  }
})

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down render worker...')
  await worker.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log(`Render worker started, listening on Redis: ${REDIS_URL}`)
