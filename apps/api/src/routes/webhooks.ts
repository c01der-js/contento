import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { verifyWebhookSignature } from '@contento/ai'
import { getVideoQueue } from '../queue.js'
import { uploadBuffer } from '../lib/s3.js'

const HiggsfieldPayload = z.object({
  job_id: z.string(),
  status: z.enum(['completed', 'failed']),
  output_url: z.string().optional(),
  error: z.string().optional(),
})

const OkResponse = z.object({ ok: z.literal(true) })
const ErrorResponse = z.object({ error: z.string() })

export const webhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/webhooks/higgsfield', {
    schema: {
      response: {
        200: OkResponse,
        400: ErrorResponse,
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    // Signature verification.
    // Requires HIGGSFIELD_WEBHOOK_SECRET to be set and @fastify/raw-body registered
    // to expose request.rawBody. In mock mode or when the secret is absent, verification
    // is skipped (acceptable for local dev; enforce in production).
    const isMock = process.env['HIGGSFIELD_MOCK'] === '1'
    const secret = process.env['HIGGSFIELD_WEBHOOK_SECRET']
    if (!isMock && secret) {
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody
      if (rawBody) {
        const valid = verifyWebhookSignature(rawBody, request.headers as Record<string, string | string[] | undefined>)
        if (!valid) return reply.status(401).send({ error: 'Invalid signature' })
      }
    }

    const parsed = HiggsfieldPayload.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid payload' })

    const payload = parsed.data

    await handleHiggsfieldWebhook({
      job_id: payload.job_id,
      status: payload.status,
      ...(payload.output_url !== undefined ? { output_url: payload.output_url } : {}),
      ...(payload.error !== undefined ? { error: payload.error } : {}),
    })

    return reply.status(200).send({ ok: true })
  })
}

async function handleHiggsfieldWebhook(payload: {
  job_id: string
  status: 'completed' | 'failed'
  output_url?: string
  error?: string
}) {
  const shot = await prisma.videoShot.findFirst({
    where: { higgsfieldJobId: payload.job_id },
  })

  if (!shot) return

  // Idempotency guard: duplicate webhooks for terminal shots are silently ignored
  if (shot.status === 'DONE' || shot.status === 'FAILED') return

  if (payload.status === 'failed' || !payload.output_url) {
    await prisma.videoShot.update({
      where: { id: shot.id },
      data: { status: 'FAILED', errorMessage: payload.error ?? 'Higgsfield reported failure' },
    })
  } else {
    // Download the clip and persist in S3
    let clipUrl: string
    try {
      const resp = await fetch(payload.output_url)
      if (!resp.ok) throw new Error(`Clip fetch failed: ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      const key = `videos/shots/${shot.videoJobId}/${shot.id}.mp4`
      clipUrl = await uploadBuffer(buf, key, 'video/mp4')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'FAILED', errorMessage: `Clip download failed: ${msg}` },
      })
      await checkAndFinalizeJob(shot.videoJobId)
      return
    }

    await prisma.videoShot.update({
      where: { id: shot.id },
      data: { status: 'DONE', clipUrl },
    })
  }

  await checkAndFinalizeJob(shot.videoJobId)
}

async function checkAndFinalizeJob(videoJobId: string) {
  const shots = await prisma.videoShot.findMany({ where: { videoJobId } })
  const allTerminal = shots.every(s => s.status === 'DONE' || s.status === 'FAILED')
  if (!allTerminal) return

  const anyFailed = shots.some(s => s.status === 'FAILED')
  if (anyFailed) {
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: 'One or more shots failed' },
    })
  } else {
    const queue = getVideoQueue()
    await queue.add('stitch', { videoJobId })
  }
}
