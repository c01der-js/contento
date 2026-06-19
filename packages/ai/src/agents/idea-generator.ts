import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'
import { buildGoldenExamplesBlock } from '../golden-examples.js'

export interface ContentIdea {
  title: string
  angle: string
  format: string
  platform: string
  rationale: string
}

export async function generateIdeas(
  workspaceId: string,
  trend: { title: string; description?: string },
  count: number = 7,
): Promise<ContentIdea[]> {
  const { systemBlock } = await buildBrandContext(workspaceId)
  const goldenBlock = await buildGoldenExamplesBlock(workspaceId, `${trend.title}\n${trend.description ?? ''}`)

  const response = await runAnthropicMessage({ agent: 'idea-generator', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      systemBlock,
      {
        type: 'text',
        text: 'You are a creative content strategist. Generate diverse content ideas. Respond with valid JSON only, no markdown fences.',
      },
      ...(goldenBlock ? [{ type: 'text' as const, text: goldenBlock }] : []),
    ],
    messages: [{ role: 'user', content: JSON.stringify({ trend, count }) }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as ContentIdea[]
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }
}
