import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface TrendAnalysis {
  score: number
  summary: string
  angles: string[]
  risks: string[]
  category?: string
  lifecycle: 'RISING' | 'PEAK' | 'DECLINING' | 'FLAT' | null
}

export async function analyzeTrend(
  workspaceId: string,
  trend: { title: string; description?: string; url?: string },
): Promise<TrendAnalysis> {
  const { systemBlock, tabooTopics } = await buildBrandContext(workspaceId)

  // US-010: taboo filter — skip LLM call if a taboo topic matches
  if (tabooTopics.length > 0) {
    const searchText = `${trend.title} ${trend.description ?? ''}`.toLowerCase()
    for (const topic of tabooTopics) {
      if (searchText.includes(topic.toLowerCase())) {
        return { score: 0, summary: '', angles: [], risks: [], category: 'FILTERED', lifecycle: null }
      }
    }
  }

  const response = await runAnthropicMessage({ agent: 'trend-analyzer', workspaceId }, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a trend analyst. Evaluate this trend for brand-relevant content opportunities.',
          'Respond with valid JSON only, no markdown fences.',
          'Return a JSON object with fields:',
          '  score (number 0-100),',
          '  summary (string),',
          '  angles (string[]),',
          '  risks (string[]),',
          '  category (string — one of: health, finance, entertainment, politics, technology, sports, lifestyle, business, science, culture, or another short category label),',
          '  lifecycle (string — one of: RISING, PEAK, DECLINING, FLAT).',
          '',
          'Lifecycle definitions:',
          '  RISING   = trend score is significantly higher than its recent average (momentum building)',
          '  PEAK     = trend is at or near its highest recent score (maximum reach)',
          '  DECLINING = trend score is dropping compared to recent history (losing relevance)',
          '  FLAT     = trend score is stable with little change over time',
        ].join('\n'),
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(trend) }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as TrendAnalysis
    // Normalise lifecycle to valid enum or null
    const validLifecycles = new Set(['RISING', 'PEAK', 'DECLINING', 'FLAT'])
    parsed.lifecycle = validLifecycles.has(parsed.lifecycle as string)
      ? (parsed.lifecycle as TrendAnalysis['lifecycle'])
      : null
    return parsed
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }
}
