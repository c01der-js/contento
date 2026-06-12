import { prisma } from '@contento/db'
import type { HiggsfieldWebhookPayload } from '@contento/ai'
import { uploadBuffer } from './s3-client.js'

export interface WebhookHandlerDeps {
  enqueueStitch: (videoJobId: string) => Promise<void>
}

/**
 * Core webhook handler logic.
 * Exported as a plain function so both the HTTP route and the mock path
 * call identical code — the mock path imports and calls this directly.
 */
export async function handleHiggsfieldWebhook(
  payload: HiggsfieldWebhookPayload,
  deps: WebhookHandlerDeps,
): Promise<void> {
  const shot = await prisma.videoShot.findFirst({
    where: { higgsfieldJobId: payload.job_id },
  })

  if (!shot) return

  // Idempotency guard: ignore duplicate webhooks for already-terminal shots
  if (shot.status === 'DONE' || shot.status === 'FAILED') return

  if (payload.status === 'failed' || !payload.output_url) {
    await prisma.videoShot.update({
      where: { id: shot.id },
      data: { status: 'FAILED', errorMessage: payload.error ?? 'Higgsfield reported failure' },
    })
  } else {
    // Download the clip and store it in S3
    let clipUrl: string
    try {
      const resp = await fetch(payload.output_url)
      if (!resp.ok) throw new Error(`Failed to fetch clip: ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      const key = `videos/shots/${shot.videoJobId}/${shot.id}.mp4`
      clipUrl = await uploadBuffer(buf, key, 'video/mp4')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'FAILED', errorMessage: `Clip download failed: ${msg}` },
      })
      await checkAndFinalizeJob(shot.videoJobId, deps)
      return
    }

    await prisma.videoShot.update({
      where: { id: shot.id },
      data: { status: 'DONE', clipUrl },
    })
  }

  await checkAndFinalizeJob(shot.videoJobId, deps)
}

async function checkAndFinalizeJob(
  videoJobId: string,
  deps: WebhookHandlerDeps,
): Promise<void> {
  const shots = await prisma.videoShot.findMany({ where: { videoJobId } })
  const allTerminal = shots.every(s => s.status === 'DONE' || s.status === 'FAILED')
  if (!allTerminal) return

  const anyFailed = shots.some(s => s.status === 'FAILED')
  if (anyFailed) {
    const details = shots
      .filter(s => s.status === 'FAILED')
      .map(s => `shot[${s.index}]: ${s.errorMessage ?? 'unknown'}`)
      .join('; ')
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: `One or more shots failed — ${details}` },
    })
  } else {
    await deps.enqueueStitch(videoJobId)
  }
}
