import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface ContentScript {
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
}

const SCHEMA_INSTRUCTION = `You are a professional social media scriptwriter. Write compelling content that sounds human, not AI-generated.

Respond with valid JSON only — no markdown fences, no extra keys. Use exactly this structure:
{
  "hook": "<opening line that stops the scroll>",
  "body": "<main script body>",
  "cta": "<call to action>",
  "caption": "<post caption>",
  "hashtags": ["#tag1", "#tag2"]
}`

function validateScript(data: unknown): ContentScript {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Agent response is not a JSON object')
  }
  const d = data as Record<string, unknown>
  const required = ['hook', 'body', 'cta', 'caption', 'hashtags'] as const
  for (const key of required) {
    if (d[key] == null) throw new Error(`Agent response missing required field: "${key}"`)
  }
  if (!Array.isArray(d['hashtags'])) throw new Error('Agent response field "hashtags" must be an array')
  return d as unknown as ContentScript
}

export async function writeScript(
  workspaceId: string,
  idea: { title: string; angle: string; format: string; platform: string },
): Promise<ContentScript> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'scriptwriter', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      systemBlock,
      { type: 'text', text: SCHEMA_INSTRUCTION },
    ],
    messages: [{ role: 'user', content: JSON.stringify(idea) }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }

  return validateScript(parsed)
}
