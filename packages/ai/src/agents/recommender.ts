import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface RecommendationContext {
  topPillars: string[]
  recentMetrics: object
  trendTitles: string[]
}

export async function getRecommendations(
  workspaceId: string,
  context: RecommendationContext,
): Promise<string[]> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'recommender', workspaceId }, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a social media strategy advisor.',
          'Based on the brand knowledge above and the supplied performance data, provide 3-5 actionable recommendations.',
          'Each recommendation must align with the brand pillars and voice.',
          'Respond with valid JSON only, no markdown fences.',
          'Return a JSON object with a single field: recommendations (string[]).',
          'Each recommendation should be a concise, actionable sentence.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          topPillars: context.topPillars,
          recentMetrics: context.recentMetrics,
          trendTitles: context.trendTitles,
        }),
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as { recommendations: string[] }
    if (!Array.isArray(parsed.recommendations)) {
      throw new Error('recommendations field is not an array')
    }
    return parsed.recommendations
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }
}
