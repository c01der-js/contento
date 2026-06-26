import { requestWithRetry, throwForResponse } from '../lib/http.js'

const GRAPH_API = 'https://graph.facebook.com/v21.0'
const PLATFORM = 'instagram'

export interface SendInstagramMessageParams {
  accessToken: string
  /** Instagram-scoped sender id (PSID) from the inbound webhook */
  recipientId: string
  text: string
  /** If true, send with messaging_type=MESSAGE_TAG & tag=HUMAN_AGENT (7-day window) */
  humanAgentTag?: boolean
}

export interface SendInstagramMessageResult {
  messageId: string
  recipientId: string
}

export async function sendInstagramMessage(
  params: SendInstagramMessageParams,
): Promise<SendInstagramMessageResult> {
  const { accessToken, recipientId, text, humanAgentTag = false } = params

  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    message: { text },
    messaging_type: humanAgentTag ? 'MESSAGE_TAG' : 'RESPONSE',
    ...(humanAgentTag ? { tag: 'HUMAN_AGENT' } : {}),
  }

  const res = await requestWithRetry(
    PLATFORM,
    `${GRAPH_API}/me/messages?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) await throwForResponse(PLATFORM, res, 'send message')

  const data = (await res.json()) as { message_id?: string; recipient_id?: string }

  return {
    messageId: data.message_id ?? '',
    recipientId: data.recipient_id ?? recipientId,
  }
}
