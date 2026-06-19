import type { PlatformPublisher, PublishPayload, PublishResult, PostMetrics } from '../types.js'
import { requestWithRetry, throwForResponse } from '../lib/http.js'

interface InstagramCredentials {
  accessToken: string
  igUserId: string
}

const GRAPH_API = 'https://graph.facebook.com/v21.0'
const PLATFORM = 'instagram'

export class InstagramPublisher implements PlatformPublisher {
  constructor(private readonly creds: InstagramCredentials) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const { accessToken, igUserId } = this.creds

    const caption = (
      payload.hashtags?.length
        ? `${payload.text}\n\n${payload.hashtags.map((h) => `#${h}`).join(' ')}`
        : payload.text
    ).slice(0, 2200)

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    }

    // VIDEO (REELS): create container -> poll status_code -> media_publish (async).
    if (payload.videoUrl) {
      const containerRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: payload.videoUrl,
          caption,
          share_to_feed: true,
        }),
      })
      if (!containerRes.ok) await throwForResponse(PLATFORM, containerRes, 'reels container create')

      const container = (await containerRes.json()) as { id?: string; error?: { message: string } }
      if (!container.id) {
        throw new Error(`Instagram reels container creation failed: ${container.error?.message ?? 'no id'}`)
      }
      const creationId = container.id

      const POLL_INTERVAL_MS = 5_000
      const MAX_ATTEMPTS = 60 // ~5 min
      let finished = false
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        const statusRes = await requestWithRetry(
          PLATFORM,
          `${GRAPH_API}/${creationId}?fields=status_code,status`,
          { method: 'GET', headers },
        )
        if (!statusRes.ok) await throwForResponse(PLATFORM, statusRes, 'reels status poll')
        const status = (await statusRes.json()) as {
          status_code?: 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'PUBLISHED' | 'EXPIRED'
          status?: string
          error?: { message: string }
        }
        if (status.status_code === 'FINISHED') { finished = true; break }
        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
          throw new Error(
            `Instagram reels processing ${status.status_code}: ${status.status ?? status.error?.message ?? 'unknown error'}`,
          )
        }
        // IN_PROGRESS / transient missing status_code -> keep polling.
      }
      if (!finished) {
        throw new Error(
          `Instagram reels processing timed out after ${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (container ${creationId})`,
        )
      }

      const publishRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media_publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ creation_id: creationId }),
      })
      if (!publishRes.ok) await throwForResponse(PLATFORM, publishRes, 'reels publish')
      const published = (await publishRes.json()) as { id?: string; error?: { message: string } }
      if (!published.id) throw new Error(`Instagram reels publish failed: ${published.error?.message ?? 'no id'}`)
      return { platformPostId: published.id }
    }

    // IMAGE: unchanged fallback.
    if (!payload.imageUrl) {
      throw new Error('Instagram requires an image URL or a video URL')
    }

    const containerRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_url: payload.imageUrl,
        caption,
        media_type: 'IMAGE',
      }),
    })
    if (!containerRes.ok) await throwForResponse(PLATFORM, containerRes, 'container create')
    const container = (await containerRes.json()) as { id?: string; error?: { message: string } }
    if (!container.id) {
      throw new Error(`Instagram container creation failed: ${container.error?.message ?? 'no id'}`)
    }

    await new Promise((r) => setTimeout(r, 5000))

    const publishRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media_publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ creation_id: container.id }),
    })
    if (!publishRes.ok) await throwForResponse(PLATFORM, publishRes, 'publish')
    const published = (await publishRes.json()) as { id?: string; error?: { message: string } }
    if (!published.id) {
      throw new Error(`Instagram publish failed: ${published.error?.message ?? 'no id'}`)
    }
    return { platformPostId: published.id }
  }

  // Insights require a Business/Creator account + app review (not yet provisioned).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
}
