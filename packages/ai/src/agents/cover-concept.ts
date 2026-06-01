import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface CoverConceptResult {
  composition: string
  palette: string[]
  textOverlay: string
  mood: string
}

export async function generateCoverConcept(
  workspaceId: string,
  script: { hook: string; body: string; format: string },
): Promise<CoverConceptResult> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'cover-concept', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a visual creative director specialising in social media cover design.',
          'Generate a single visual cover concept for a social media post based on the provided script.',
          'Return a JSON object with exactly these fields:',
          '  composition  — layout description (e.g. "bold centered text on blurred background")',
          '  palette      — array of 2-4 hex colour codes that match the brand and content mood',
          '  textOverlay  — short text (8 words or fewer) to display on the cover',
          '  mood         — one or two words describing the emotional atmosphere (e.g. "energetic, bold")',
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
    const parsed = JSON.parse(text) as CoverConceptResult
    if (
      typeof parsed.composition !== 'string' ||
      !Array.isArray(parsed.palette) ||
      typeof parsed.textOverlay !== 'string' ||
      typeof parsed.mood !== 'string'
    ) {
      throw new Error('Missing required fields')
    }
    return parsed
  } catch {
    throw new Error('cover-concept agent returned invalid JSON: ' + text.slice(0, 120))
  }
}
