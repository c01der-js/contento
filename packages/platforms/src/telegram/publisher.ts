import type { PlatformPublisher, PublishPayload, PublishResult, PostMetrics } from '../types.js'
import { requestWithRetry, throwForResponse } from '../lib/http.js'

interface TelegramCredentials {
  botToken: string
  channelId: string
}

const TG_API = 'https://api.telegram.org'
const PLATFORM = 'telegram'

export class TelegramPublisher implements PlatformPublisher {
  constructor(private readonly creds: TelegramCredentials) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const { botToken, channelId } = this.creds
    const text = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    // Prefer video, then image, then plain text.
    // sendVideo accepts a remote HTTPS URL as `video` (same as sendPhoto's `photo`);
    // Telegram fetches it server-side. URL-based sends cap non-photo files at ~20MB.
    let endpoint: string
    let label: string
    let body: Record<string, unknown>

    if (payload.videoUrl) {
      endpoint = `${TG_API}/bot${botToken}/sendVideo`
      label = 'sendVideo'
      body = {
        chat_id: channelId,
        video: payload.videoUrl,
        caption: text.slice(0, 1024),
        parse_mode: 'HTML',
        supports_streaming: true,
      }
    } else if (payload.imageUrl) {
      endpoint = `${TG_API}/bot${botToken}/sendPhoto`
      label = 'sendPhoto'
      body = {
        chat_id: channelId,
        photo: payload.imageUrl,
        caption: text.slice(0, 1024),
        parse_mode: 'HTML',
      }
    } else {
      endpoint = `${TG_API}/bot${botToken}/sendMessage`
      label = 'sendMessage'
      body = {
        chat_id: channelId,
        text: text.slice(0, 4096),
        parse_mode: 'HTML',
      }
    }

    const res = await requestWithRetry(PLATFORM, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, label)

    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok || !data.result) {
      throw new Error(`Telegram ${label} failed: ${data.description ?? 'unknown'}`)
    }

    return { platformPostId: String(data.result.message_id) }
  }

  // Bot API does not expose per-post view counts (would require MTProto).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
}
