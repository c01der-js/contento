import { getAnthropicClient } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface StoryboardShot {
  shot: number
  duration: number
  voiceover: string
  visual: string
}

export async function generateStoryboard(
  workspaceId: string,
  script: { hook: string; body: string },
): Promise<StoryboardShot[]> {
  const client = getAnthropicClient()
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a professional video director creating storyboards for social media content.',
          'Break the provided script into 3-5 shots for a short-form video.',
          'Return a JSON array of shot objects. Each object must have exactly these fields:',
          '  shot      — integer shot number starting at 1',
          '  duration  — integer duration in seconds for this shot',
          '  voiceover — the spoken words for this shot (from the script)',
          '  visual    — concise description of what should appear on screen (max 20 words)',
          'Respond with valid JSON array only. No markdown fences. No extra text.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ hook: script.hook, body: script.body }),
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as StoryboardShot[]
    if (!Array.isArray(parsed) || parsed.length < 1) {
      throw new Error('Expected non-empty array')
    }
    return parsed
  } catch {
    throw new Error('storyboard agent returned invalid JSON: ' + text.slice(0, 120))
  }
}
