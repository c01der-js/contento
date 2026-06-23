import {
  TypedConsumer,
  TypedProducer,
  createKafkaClient,
  TOPIC_PUBLISH,
  PublishRequestedSchema,
} from '@contento/shared'
import { prisma, PublicationStatus } from '@contento/db'
import { createPublisher } from '@contento/platforms'
import type { PublishPayload } from '@contento/platforms'
import { presignGetUrl, isOwnS3Url, keyFromUrl } from './s3.js'

// ---------------------------------------------------------------------------
// UTM tagging
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s]+/g

function appendUtm(url: string, params: Record<string, string>): string {
  const separator = url.includes('?') ? '&' : '?'
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `${url}${separator}${query}`
}

function applyUtmToCaption(
  caption: string,
  platform: string,
  scriptId: string,
  publicationId: string,
): { caption: string; utmCampaign: string } {
  const utmParams = {
    utm_source: platform,
    utm_medium: 'social',
    utm_campaign: scriptId,
    utm_content: publicationId,
  }
  const tagged = caption.replace(URL_REGEX, (url) => appendUtm(url, utmParams))
  return { caption: tagged, utmCampaign: scriptId }
}

// ---------------------------------------------------------------------------
// CRM webhook fire-and-forget
// ---------------------------------------------------------------------------

async function fireCrmWebhooks(
  workspaceId: string,
  payload: {
    event: string
    publicationId: string
    scriptId: string
    platform: string
    publishedAt: string
    postUrl: string | null | undefined
  },
): Promise<void> {
  const integrations = await prisma.integration.findMany({
    where: { workspaceId, type: 'CRM_WEBHOOK', enabled: true },
  })
  await Promise.allSettled(
    integrations.map(async (integration) => {
      const config = integration.config as Record<string, unknown>
      const webhookUrl = String(config['webhookUrl'] ?? '')
      if (!webhookUrl) return
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        })
      } catch (err) {
        console.error(`CRM webhook delivery failed for integration ${integration.id}:`, err)
      }
    }),
  )
}

const TOPIC_PUBLISH_COMPLETED = 'publish.completed' as const
const TOPIC_PUBLISH_FAILED = 'publish.failed' as const

// Lazy producer
const kafka = createKafkaClient({ clientId: 'posting-service' })
let _producer: TypedProducer | null = null

function getProducer(): TypedProducer {
  if (!_producer) {
    _producer = new TypedProducer(kafka)
  }
  return _producer
}

export function getKafkaProducer(): TypedProducer {
  return getProducer()
}

export function createWorkerConsumer(): TypedConsumer {
  return new TypedConsumer(kafka, 'posting-service')
}

export async function runWorker(consumer: TypedConsumer): Promise<void> {
  await consumer.subscribe([TOPIC_PUBLISH])

  await consumer.run<unknown>(
    async (_topic, rawPayload) => {
      try {
        // Parse and validate the event
        const event = PublishRequestedSchema.parse(rawPayload)
        const { publicationId, workspaceId, platform } = event

        // Atomically claim the publication to avoid TOCTOU race with concurrent workers
        const { count } = await prisma.publication.updateMany({
          where: {
            id: publicationId,
            status: { notIn: ['PUBLISHED', 'FAILED', 'PUBLISHING'] },
          },
          data: { status: 'PUBLISHING' },
        })
        if (count === 0) {
          // already claimed or in terminal state — skip
          return
        }

        // Load publication after claim (updateMany doesn't return the record)
        const publication = await prisma.publication.findUnique({
          where: { id: publicationId },
          include: { script: true, renderJob: true, socialAccount: true, videoJob: true },
        })
        if (!publication) return // shouldn't happen but guard anyway

        // Guard against deleted script
        if (!publication.script) {
          await prisma.publication.update({
            where: { id: publicationId },
            data: { status: 'FAILED', errorMessage: 'Script not found' },
          })
          return
        }

        const { socialAccount } = publication

        if (!socialAccount) {
          await prisma.publication.update({
            where: { id: publicationId },
            data: {
              status: PublicationStatus.FAILED,
              errorMessage: `SocialAccount ${publication.socialAccountId} not found`,
            },
          })
          await getProducer().send(TOPIC_PUBLISH_FAILED, {
            eventId: crypto.randomUUID(),
            workspaceId,
            timestamp: new Date().toISOString(),
            publicationId,
            platform,
            error: `SocialAccount ${publication.socialAccountId} not found`,
            retryable: false,
          })
          return
        }

        // Apply UTM tagging to any URLs in the caption
        const { caption: taggedCaption, utmCampaign } = applyUtmToCaption(
          publication.script.caption,
          event.platform,
          publication.scriptId,
          publicationId,
        )

        // Prefer the generated video. The MP4 lives in a private bucket, so presign
        // a short-lived GET URL the platform's servers can fetch over the internet.
        const rawVideoUrl = publication.videoJob?.outputUrl ?? null
        let videoUrl: string | null = rawVideoUrl
        if (rawVideoUrl && isOwnS3Url(rawVideoUrl)) {
          videoUrl = await presignGetUrl(keyFromUrl(rawVideoUrl), 3600)
        }

        const payload: PublishPayload = {
          text: taggedCaption,
          ...(videoUrl ? { videoUrl } : {}),
          ...(publication.renderJob?.outputUrl ? { imageUrl: publication.renderJob.outputUrl } : {}),
          hashtags: publication.script.hashtags,
        }

        try {
          const result = await createPublisher(
            event.platform,
            socialAccount.credentials as Record<string, unknown>,
          ).publish(payload)

          const publishedAt = new Date()

          await prisma.publication.update({
            where: { id: publicationId },
            data: {
              status: PublicationStatus.PUBLISHED,
              platformPostId: result.platformPostId,
              postUrl: result.url ?? null,
              utmCampaign,
              publishedAt,
            },
          })

          await getProducer().send(TOPIC_PUBLISH_COMPLETED, {
            eventId: crypto.randomUUID(),
            workspaceId,
            timestamp: new Date().toISOString(),
            publicationId,
            platform,
            externalId: result.platformPostId,
            publishedAt: publishedAt.toISOString(),
            url: result.url,
          })

          // Fire CRM webhooks — non-blocking, failures don't affect publish result
          fireCrmWebhooks(workspaceId, {
            event: 'PUBLISHED',
            publicationId,
            scriptId: publication.scriptId,
            platform,
            publishedAt: publishedAt.toISOString(),
            postUrl: result.url,
          }).catch((err) => console.error('CRM webhook dispatch error:', err))
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)

          await prisma.publication.update({
            where: { id: publicationId },
            data: {
              status: PublicationStatus.FAILED,
              errorMessage,
            },
          })

          await getProducer().send(TOPIC_PUBLISH_FAILED, {
            eventId: crypto.randomUUID(),
            workspaceId,
            timestamp: new Date().toISOString(),
            publicationId,
            platform,
            error: errorMessage,
            retryable: true,
          })
        }
      } catch (err) {
        console.error('Unhandled error in publish handler:', err)
        // do not re-throw — always ack
      }
    },
    // No schema passed here — we validate manually above so we can handle errors gracefully
  )
}
