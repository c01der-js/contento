import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface ContentScript {
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
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
      {
        type: 'text',
        text: 'You are a professional social media scriptwriter. Write compelling content that sounds human, not AI-generated. Respond with valid JSON only, no markdown fences.',
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(idea) }],
  })



  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as ContentScript
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }
}
