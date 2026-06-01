import { Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { writeScript } from '@contento/ai'
import { getVideoQueue } from '../queue.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const VIDEO_POLL_INTERVAL_MS = 15_000
const VIDEO_TIMEOUT_MS = 45 * 60 * 1000 // 45 min per video

interface ProducePayload {
  campaignId: string
  workspaceId: string
}

async function pollVideoJob(videoJobId: string, timeoutMs: number): Promise<'DONE' | 'FAILED'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { status: true } })
    if (job?.status === 'DONE') return 'DONE'
    if (job?.status === 'FAILED') return 'FAILED'
    await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL_MS))
  }
  return 'FAILED'
}

async function notifyClients(workspaceId: string, itemId: string): Promise<void> {
  const clients = await prisma.membership.findMany({
    where: { workspaceId, role: 'CLIENT' },
    select: { userId: true },
  })
  if (clients.length === 0) return
  await prisma.notification.createMany({
    data: clients.map(m => ({
      workspaceId,
      userId: m.userId,
      type: 'APPROVAL_NEEDED' as const,
      title: 'Video ready for review',
      body: 'A new video in your campaign is ready for your approval.',
      entityType: 'ContentPlanItem',
      entityId: itemId,
    })),
  })
}

export function startCampaignProducer(): Worker {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

  const worker = new Worker<ProducePayload>(
    'campaign-producer',
    async (job) => {
      const { campaignId, workspaceId } = job.data

      const plan = await prisma.contentPlan.findUnique({
        where: { campaignId },
        include: { items: { orderBy: { index: 'asc' } }, campaign: true },
      })
      if (!plan) throw new Error(`ContentPlan not found for campaign ${campaignId}`)

      await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'IN_PRODUCTION' } })

      const avatarPersona = await prisma.avatarPersona.findFirst({ where: { workspaceId } })
      const soulId = avatarPersona?.higgsfieldSoulId ?? process.env['HIGGSFIELD_SOUL_ID'] ?? ''

      for (const item of plan.items) {
        if (item.status !== 'PENDING') continue

        // Step 1: Generate script
        await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'SCRIPTING' } })

        let scriptId: string
        try {
          const contentScript = await writeScript(workspaceId, {
            title: item.topic,
            angle: item.hook,
            format: item.format,
            platform: 'instagram',
          })

          const script = await prisma.script.create({
            data: {
              workspaceId,
              hook: contentScript.hook,
              body: contentScript.body,
              cta: contentScript.cta,
              caption: contentScript.caption,
              hashtags: contentScript.hashtags,
              status: 'APPROVED',
            },
          })
          scriptId = script.id
          await prisma.contentPlanItem.update({ where: { id: item.id }, data: { scriptId, status: 'SCRIPTED' } })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await prisma.contentPlanItem.update({
            where: { id: item.id },
            data: { status: 'REJECTED', rejectComment: `Script generation failed: ${msg}` },
          })
          continue
        }

        // Step 2: Enqueue video job
        await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'VIDEO_QUEUED' } })

        const videoJob = await prisma.videoJob.create({
          data: { workspaceId, scriptId, status: 'PENDING', language: 'ru', aspectRatio: '9:16' },
        })

        await getVideoQueue().add('generate', {
          videoJobId: videoJob.id,
          scriptId,
          workspaceId,
          language: 'ru',
          soulId,
        })

        await prisma.contentPlanItem.update({
          where: { id: item.id },
          data: { videoJobId: videoJob.id, status: 'VIDEO_GENERATING' },
        })

        // Step 3: Poll until done
        const result = await pollVideoJob(videoJob.id, VIDEO_TIMEOUT_MS)

        if (result === 'DONE') {
          await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'CLIENT_REVIEW' } })
          await notifyClients(workspaceId, item.id)
        } else {
          const failed = await prisma.videoJob.findUnique({ where: { id: videoJob.id }, select: { errorMessage: true } })
          await prisma.contentPlanItem.update({
            where: { id: item.id },
            data: { status: 'REJECTED', rejectComment: `Video generation failed: ${failed?.errorMessage ?? 'timeout'}` },
          })
        }
      }

      // Check if all done — update plan status
      const remaining = await prisma.contentPlanItem.count({
        where: {
          contentPlanId: plan.id,
          status: { in: ['PENDING', 'SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'] },
        },
      })
      if (remaining === 0) {
        await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'COMPLETED' } })
      }
    },
    { connection, concurrency: 1, lockDuration: 50 * 60 * 1000 },
  )

  worker.on('failed', (job, err) => {
    console.error(`[campaign-producer] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
