import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface SeriesEpisode {
  title: string
  angle: string
  format: string
  platform: string
  order: number
}

export async function planSeries(
  workspaceId: string,
  topic: string,
  count: number,
): Promise<SeriesEpisode[]> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'series-planner', workspaceId }, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You plan connected social media post series for the brand described above.',
          'Each episode builds on the previous one and stays aligned with the brand pillars, voice, and audience.',
          'Avoid taboo topics listed in the brand knowledge base.',
          'Return ONLY a JSON array, no markdown.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Create ${count} connected posts about: "${topic}". Each item: {"title":"...","angle":"...","format":"Reels|Carousel|Article|Shorts","platform":"instagram|tiktok|youtube","order":N}`,
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '[]'
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim() || '[]'
  try {
    return JSON.parse(text) as SeriesEpisode[]
  } catch {
    throw new Error('series-planner returned invalid JSON: ' + text.slice(0, 100))
  }
}
