import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'
import { requestWithRetry, throwForResponse } from '../lib/http.js'

const TIKTOK_API = 'https://open.tiktokapis.com/v2'
const PLATFORM = 'tiktok'

export class TikTokPublisher implements PlatformPublisher {
  constructor(private readonly creds: { accessToken: string; openId: string }) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const videoUrl = payload.videoUrl ?? payload.imageUrl
    if (!videoUrl) throw new Error('TikTok requires a video URL')

    const text = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    const res = await requestWithRetry(PLATFORM, `${TIKTOK_API}/post/publish/inbox/video/init/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${this.creds.accessToken}`,
      },
      body: JSON.stringify({
        post_info: {
          title: text.slice(0, 2200),
          privacy_level: 'FOLLOWER_OF_CREATOR',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
        },
      }),
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, 'publish init')

    const data = (await res.json()) as { data?: { publish_id?: string }; error?: { message: string } }
    const publishId = data.data?.publish_id
    if (!publishId) throw new Error(`TikTok publish failed: ${data.error?.message ?? 'unknown error'}`)
    return { platformPostId: publishId }
  }
}
