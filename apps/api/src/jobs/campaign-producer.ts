import { Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { writeScript, embedText, writeScriptEmbedding } from '@contento/ai'
import { getVideoQueue } from '../queue.js'
import { runQaChecks } from '../qa/checks.js'
import type { QaInput } from '../qa/checks.js'
import { resolvePlatformProfile } from '../lib/platform-profile.js'
type QaInputSubtitles = QaInput['subtitles']

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const VIDEO_POLL_INTERVAL_MS = 15_000
const VIDEO_TIMEOUT_MS = 45 * 60 * 1000 // 45 min per video

interface ProducePayload {
  campaignId: string
  workspaceId: string
}

async function pollVideoJob(
  videoJobId: string,
  campaignId: string,
  timeoutMs: number,
  extendLock: () => Promise<unknown>,
): Promise<'DONE' | 'FAILED' | 'CANCELLED'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const dbJob = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { status: true } })
    if (dbJob?.status === 'DONE') return 'DONE'
    if (dbJob?.status === 'FAILED') return 'FAILED'
    // Stop signal: the user pressed Stop, which reverts the plan out of IN_PRODUCTION.
    const plan = await prisma.contentPlan.findUnique({ where: { campaignId }, select: { status: true } })
    if (plan?.status !== 'IN_PRODUCTION') return 'CANCELLED'
    await extendLock().catch(() => {})
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
    async (job, token) => {
      const { campaignId, workspaceId } = job.data

      const plan = await prisma.contentPlan.findUnique({
        where: { campaignId },
        include: { items: { orderBy: { index: 'asc' } }, campaign: true },
      })
      if (!plan) throw new Error(`ContentPlan not found for campaign ${campaignId}`)

      await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'IN_PRODUCTION' } })

      const avatarPersona = await prisma.avatarPersona.findFirst({ where: { workspaceId } })
      const soulId = avatarPersona?.higgsfieldSoulId ?? process.env['HIGGSFIELD_SOUL_ID'] ?? ''

      // Every per-item status write below is a gated `updateMany` requiring the
      // expected prior status. A Stop concurrently reverts the plan to DRAFT and
      // resets in-flight items to PENDING (routes/campaigns.ts), so any gated write
      // then matches 0 rows — that is our signal to abort the item without
      // corrupting it (no spurious SCRIPTED/CLIENT_REVIEW/REJECTED on a reset item).
      for (const item of plan.items) {
        // Halt before starting any further item once the plan leaves IN_PRODUCTION.
        const live = await prisma.contentPlan.findUnique({ where: { campaignId }, select: { status: true } })
        if (live?.status !== 'IN_PRODUCTION') break

        // Step 1: claim the item (PENDING -> SCRIPTING). Skip if not ours.
        const claimed = await prisma.contentPlanItem.updateMany({
          where: { id: item.id, status: 'PENDING' },
          data: { status: 'SCRIPTING' },
        })
        if (claimed.count === 0) continue

        let scriptId: string
        try {
          // Honor the workspace's per-platform profile override (falls back to static default).
          const platformProfile = await resolvePlatformProfile(workspaceId, item.platform ?? 'instagram')
          const contentScript = await writeScript(workspaceId, {
            title: item.topic,
            angle: item.hook,
            format: item.format,
            platform: item.platform ?? 'instagram',
          }, platformProfile)

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

          // Feedback loop: embed the script so it's retrievable / rankable. Best-effort.
          try {
            await writeScriptEmbedding(script.id, await embedText(`${script.hook}\n${script.body}\n${script.caption}`))
          } catch (err) {
            console.error('[feedback] failed to embed script', script.id, err)
          }

          // SCRIPTING -> SCRIPTED. If a Stop reset the item during writeScript, this
          // matches 0 rows: discard the script and halt.
          const scripted = await prisma.contentPlanItem.updateMany({
            where: { id: item.id, status: 'SCRIPTING' },
            data: { scriptId, status: 'SCRIPTED' },
          })
          if (scripted.count === 0) break
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          // Only mark REJECTED if the item is still ours (a Stop would have reset it).
          await prisma.contentPlanItem.updateMany({
            where: { id: item.id, status: 'SCRIPTING' },
            data: { status: 'REJECTED', rejectComment: `Script generation failed: ${msg}` },
          })
          continue
        }

        // Step 2: SCRIPTED -> VIDEO_QUEUED.
        const queued = await prisma.contentPlanItem.updateMany({
          where: { id: item.id, status: 'SCRIPTED' },
          data: { status: 'VIDEO_QUEUED' },
        })
        if (queued.count === 0) break

        // The VideoJob row is cheap (no external credits). Create it, then only
        // enqueue the (credit-consuming) generate job after we confirm ownership
        // via the gated VIDEO_QUEUED -> VIDEO_GENERATING write.
        const videoJob = await prisma.videoJob.create({
          data: { workspaceId, scriptId, status: 'PENDING', language: 'ru', aspectRatio: '9:16', platform: item.platform ?? null },
        })

        const generating = await prisma.contentPlanItem.updateMany({
          where: { id: item.id, status: 'VIDEO_QUEUED' },
          data: { videoJobId: videoJob.id, status: 'VIDEO_GENERATING' },
        })
        if (generating.count === 0) {
          // Stopped in the gap — clean up the unused VideoJob and never enqueue.
          await prisma.videoJob.delete({ where: { id: videoJob.id } }).catch(() => {})
          break
        }

        await getVideoQueue().add('generate', {
          videoJobId: videoJob.id,
          scriptId,
          workspaceId,
          language: 'ru',
          soulId,
          platform: item.platform ?? null,
        })

        // Step 3: Poll until done
        const result = await pollVideoJob(
          videoJob.id,
          campaignId,
          VIDEO_TIMEOUT_MS,
          () => job.extendLock(token ?? '', VIDEO_POLL_INTERVAL_MS * 3),
        )

        // Stop pressed mid-render: the stop endpoint already reset this item to
        // PENDING, so don't mark it — just halt the loop.
        if (result === 'CANCELLED') break

        if (result === 'DONE') {
          // Gate VIDEO_GENERATING -> CLIENT_REVIEW so a Stop that raced the DONE
          // return (resetting the item to PENDING) is not clobbered.
          const reviewed = await prisma.contentPlanItem.updateMany({
            where: { id: item.id, status: 'VIDEO_GENERATING' },
            data: { status: 'CLIENT_REVIEW' },
          })
          if (reviewed.count === 0) break

          // Auto QA gate: compute a verdict from the finished job and persist it for the
          // approve handler + the review UI. Never throws into the producer loop.
          try {
            const dbJob = await prisma.videoJob.findUnique({
              where: { id: videoJob.id },
              include: { shots: { orderBy: { index: 'asc' } }, script: { select: { subtitles: true } } },
            })
            if (dbJob) {
              const qa = runQaChecks({
                platform: dbJob.platform,
                outputUrl: dbJob.outputUrl,
                jobStatus: dbJob.status,
                shots: dbJob.shots.map((s) => ({ index: s.index, durationSec: s.durationSec, dialogue: s.dialogue, status: s.status })),
                subtitles: (dbJob.script.subtitles as unknown as QaInputSubtitles) ?? null,
              })
              await prisma.qaCheck.create({
                data: { contentPlanItemId: item.id, videoJobId: dbJob.id, status: qa.status, findings: qa.findings as object },
              })
            }
          } catch (err) {
            console.error('[qa] failed to compute/persist QA check for item', item.id, err)
          }

          await notifyClients(workspaceId, item.id)
        } else {
          const failed = await prisma.videoJob.findUnique({ where: { id: videoJob.id }, select: { errorMessage: true } })
          const rejected = await prisma.contentPlanItem.updateMany({
            where: { id: item.id, status: 'VIDEO_GENERATING' },
            data: { status: 'REJECTED', rejectComment: `Video generation failed: ${failed?.errorMessage ?? 'timeout'}` },
          })
          if (rejected.count === 0) break
        }
      }

      // Finalize atomically: the gated updateMany only flips COMPLETED if the plan
      // is still IN_PRODUCTION, so a concurrent Stop's DRAFT is never overwritten.
      const remaining = await prisma.contentPlanItem.count({
        where: {
          contentPlanId: plan.id,
          status: { in: ['PENDING', 'SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'] },
        },
      })
      if (remaining === 0) {
        const finalized = await prisma.contentPlan.updateMany({
          where: { campaignId, status: 'IN_PRODUCTION' },
          data: { status: 'COMPLETED' },
        })
        if (finalized.count > 0) {
          await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'COMPLETED' } })
        }
      }
    },
    { connection, concurrency: 1, lockDuration: VIDEO_POLL_INTERVAL_MS * 5 },
  )

  worker.on('failed', (job, err) => {
    console.error(`[campaign-producer] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
