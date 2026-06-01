import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'
import { requestWithRetry, throwForResponse } from '../lib/http.js'

const VK_API = 'https://api.vk.com/method'
const VK_VERSION = '5.199'
const PLATFORM = 'vk'

export class VKPublisher implements PlatformPublisher {
  constructor(private readonly creds: { accessToken: string; ownerId: string }) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const message = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    const params = new URLSearchParams({
      owner_id: this.creds.ownerId,
      message: message.slice(0, 16383),
      v: VK_VERSION,
      access_token: this.creds.accessToken,
      ...(payload.imageUrl ? { attachments: payload.imageUrl } : {}),
    })

    const res = await requestWithRetry(PLATFORM, `${VK_API}/wall.post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, 'wall.post')

    const data = (await res.json()) as {
      response?: { post_id: number }
      error?: { error_msg: string }
    }
    if (data.error) throw new Error(`VK wall.post failed: ${data.error.error_msg}`)
    if (!data.response?.post_id) throw new Error('VK did not return post_id')
    return { platformPostId: String(data.response.post_id) }
  }
}
