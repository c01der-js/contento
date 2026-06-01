import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'
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

    const endpoint = payload.imageUrl
      ? `${TG_API}/bot${botToken}/sendPhoto`
      : `${TG_API}/bot${botToken}/sendMessage`

    const body = payload.imageUrl
      ? {
          chat_id: channelId,
          photo: payload.imageUrl,
          caption: text.slice(0, 1024),
          parse_mode: 'HTML',
        }
      : {
          chat_id: channelId,
          text: text.slice(0, 4096),
          parse_mode: 'HTML',
        }

    const res = await requestWithRetry(PLATFORM, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, payload.imageUrl ? 'sendPhoto' : 'sendMessage')

    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok || !data.result) {
      throw new Error(`Telegram ${payload.imageUrl ? 'sendPhoto' : 'sendMessage'} failed: ${data.description ?? 'unknown'}`)
    }

    return { platformPostId: String(data.result.message_id) }
  }
}
