import Anthropic from '@anthropic-ai/sdk'
import { trackUsage } from './usage-tracker.js'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return _client
}

type MessageCreateParams = Parameters<Anthropic['messages']['create']>[0]
type NonStreamingParams = MessageCreateParams & { stream?: false | undefined }
type MessageResponse = Anthropic.Messages.Message

export interface RunAgentMeta {
  agent: string
  workspaceId?: string | null
}

/**
 * Call Anthropic messages.create and record the LLM usage event to ClickHouse.
 * The trackUsage call is fire-and-forget — it never blocks the agent response.
 */
export async function runAnthropicMessage(
  meta: RunAgentMeta,
  params: NonStreamingParams,
): Promise<MessageResponse> {
  const client = getAnthropicClient()
  const response = (await client.messages.create(params)) as MessageResponse

  const usage = response.usage as
    | {
        input_tokens?: number
        output_tokens?: number
        cache_creation_input_tokens?: number | null
        cache_read_input_tokens?: number | null
      }
    | undefined

  if (usage && meta.workspaceId) {
    trackUsage(meta.workspaceId, meta.agent, params.model, {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    })
  }

  return response
}
