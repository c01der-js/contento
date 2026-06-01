import type { Message } from '@anthropic-ai/sdk/resources/messages.js'

export function parseAgentJson<T>(response: Message): T {
  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 120))
  }
}
