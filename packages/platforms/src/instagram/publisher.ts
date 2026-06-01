import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'
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

    if (!payload.imageUrl) {
      throw new Error('Instagram requires an image URL')
    }

    const caption = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    // 1. Create media container
    const containerRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        image_url: payload.imageUrl,
        caption: caption.slice(0, 2200),
        media_type: 'IMAGE',
      }),
    })
    if (!containerRes.ok) await throwForResponse(PLATFORM, containerRes, 'container create')

    const container = (await containerRes.json()) as { id?: string; error?: { message: string } }
    if (!container.id) {
      throw new Error(`Instagram container creation failed: ${container.error?.message ?? 'no id'}`)
    }

    // 2. Wait for processing, then publish
    await new Promise((r) => setTimeout(r, 5000))

    const publishRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ creation_id: container.id }),
    })
    if (!publishRes.ok) await throwForResponse(PLATFORM, publishRes, 'publish')

    const published = (await publishRes.json()) as { id?: string; error?: { message: string } }
    if (!published.id) {
      throw new Error(`Instagram publish failed: ${published.error?.message ?? 'no id'}`)
    }

    return { platformPostId: published.id }
  }
}
