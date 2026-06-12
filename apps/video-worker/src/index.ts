import { createWorker } from './worker.js'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'

const { worker } = createWorker(REDIS_URL)

worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} (${job.name}) completed`, result ?? '')
})

worker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} (${job?.name}) failed:`, err.message)
  // Both 'generate' and 'stitch' carry videoJobId — mark the job FAILED so the
  // producer's poll fails fast instead of waiting out the 45-min timeout.
  if ((job?.name === 'generate' || job?.name === 'stitch') && job.data && 'videoJobId' in job.data) {
    const { prisma } = await import('@contento/db')
    await prisma.videoJob
      .update({
        where: { id: (job.data as { videoJobId: string }).videoJobId },
        data: { status: 'FAILED', errorMessage: err.message },
      })
      .catch(() => {})
  }
})

async function shutdown() {
  console.log('Shutting down video worker...')
  await worker.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log(`Video worker started, listening on Redis: ${REDIS_URL}`)
