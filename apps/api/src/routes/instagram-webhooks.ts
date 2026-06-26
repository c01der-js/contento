import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getInstagramQueue } from '../queue.js'

// Instagram Messaging webhook payload. We only act on inbound text messages; every other
// event shape (echoes, reactions, story replies, `changes`, etc.) is acknowledged and ignored.
const IgMessagingPayload = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      messaging: z
        .array(
          z.object({
            sender: z.object({ id: z.string() }),
            recipient: z.object({ id: z.string() }).optional(),
            timestamp: z.number().optional(),
            message: z
              .object({
                mid: z.string().optional(),
                text: z.string().optional(),
                is_echo: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
})

// Meta signs the POST body with HMAC-SHA256(appSecret) in the `x-hub-signature-256` header
// (format `sha256=<hex>`). rawBodyString is stashed by the JSON content-type parser in server.ts.
function verifyMetaSignature(
  rawBody: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const instagramWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET — Meta subscription verification handshake. Echoes hub.challenge when the verify token matches.
  app.get('/webhooks/instagram', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>
    const verifyToken = process.env['META_WEBHOOK_VERIFY_TOKEN']
    if (q['hub.mode'] === 'subscribe' && verifyToken && q['hub.verify_token'] === verifyToken) {
      return reply.type('text/plain').send(q['hub.challenge'] ?? '')
    }
    return reply.status(403).send({ error: 'Verification failed' })
  })

  // POST — inbound messaging events. Verifies the signature, then enqueues each inbound text
  // message to the `instagram-dm` queue (consumed by apps/instagram-agent). Always 200s fast so
  // Meta does not retry-storm; dedupe happens at the queue (jobId) and DB (Message.externalId) layers.
  app.post('/webhooks/instagram', async (request, reply) => {
    const secret = process.env['FB_APP_SECRET']
    if (secret) {
      const rawBody = (request as unknown as { rawBodyString?: string }).rawBodyString
      const sig = request.headers['x-hub-signature-256'] as string | undefined
      if (!verifyMetaSignature(rawBody, sig, secret)) {
        return reply.status(401).send({ error: 'Invalid signature' })
      }
    }

    const parsed = IgMessagingPayload.safeParse(request.body)
    if (!parsed.success) return reply.status(200).send({ ok: true })

    const queue = getInstagramQueue()
    for (const entry of parsed.data.entry) {
      const igAccountId = entry.id
      for (const m of entry.messaging ?? []) {
        const msg = m.message
        if (!msg || msg.is_echo || !msg.text) continue
        await queue.add(
          'inbound',
          { igAccountId, senderId: m.sender.id, messageId: msg.mid ?? null, text: msg.text },
          msg.mid ? { jobId: `ig-${msg.mid}` } : {},
        )
      }
    }
    return reply.status(200).send({ ok: true })
  })
}
