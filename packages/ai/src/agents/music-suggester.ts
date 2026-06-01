import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface MusicSuggestion {
  genre: string
  tempo: string
  mood: string
  suggestions: string[]
}

export async function suggestMusic(
  workspaceId: string,
  script: { hook: string; body: string; format: string },
): Promise<MusicSuggestion> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'music-suggester', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a music supervisor for social media video content.',
          'Based on the provided script and content format, suggest background music that fits the mood and brand.',
          'Return a JSON object with exactly these fields:',
          '  genre       — primary music genre (e.g. "electronic", "acoustic pop", "hip-hop")',
          '  tempo       — tempo description (e.g. "upbeat 120 BPM", "slow 70 BPM")',
          '  mood        — emotional mood description (e.g. "energetic and motivating")',
          '  suggestions — array of 3-5 specific track or artist name suggestions',
          'Respond with valid JSON only. No markdown fences. No extra keys.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ hook: script.hook, body: script.body, format: script.format }),
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as MusicSuggestion
    if (
      typeof parsed.genre !== 'string' ||
      typeof parsed.tempo !== 'string' ||
      typeof parsed.mood !== 'string' ||
      !Array.isArray(parsed.suggestions)
    ) {
      throw new Error('Missing required fields')
    }
    return parsed
  } catch {
    throw new Error('music-suggester agent returned invalid JSON: ' + text.slice(0, 120))
  }
}
