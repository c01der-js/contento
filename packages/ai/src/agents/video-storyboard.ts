import { z } from 'zod'
import { getAnthropicClient } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export const VideoShotSchema = z.object({
  index: z.number().int().min(0),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  durationSec: z.number().positive(),
})

export type VideoShot = z.infer<typeof VideoShotSchema>

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
  hi: 'Hindi',
}

function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code
}

export async function generateVideoStoryboard(
  workspaceId: string,
  script: { hook: string; body: string; cta: string },
  options?: { shotCount?: number; characterDescription?: string; language?: string },
): Promise<VideoShot[]> {
  const client = getAnthropicClient()
  const { systemBlock } = await buildBrandContext(workspaceId)

  const shotCount = options?.shotCount ?? 5
  const language = options?.language ?? 'ru'
  const characterHint = options?.characterDescription
    ? `The video features a single consistent AI avatar: ${options.characterDescription}.`
    : 'The video features a single consistent AI avatar character throughout.'
  const languageDirective = `Write every 'dialogue' field in ${languageName(language)} (BCP-47 '${language}'). Visual 'prompt' fields must stay in English for the image generation model.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      systemBlock,
      {
        type: 'text',
        text: [
          'You are a professional short-form video director creating storyboards for TikTok / Reels / Shorts.',
          characterHint,
          languageDirective,
          `Break the script into exactly ${shotCount} shots following the viral structure: hook → value delivery → CTA/ending.`,
          'Return a JSON array. Each element must have exactly these fields:',
          '  index      — integer, starting at 0',
          '  prompt     — visual/cinematic description of what to show (max 30 words); describe the scene, camera angle, action, mood',
          '  dialogue   — the spoken words for this shot (direct quote from the script); omit the field if the shot is silent',
          '  durationSec — float, how long this shot should be in seconds (typically 1.5–5)',
          'Rules:',
          '  - First shot must be the hook; last shot must be the CTA / ending',
          '  - Total duration should be 15–60 seconds',
          '  - Keep the same character and visual style across all shots',
          '  - dialogue must come directly from the provided script text',
          'Respond with valid JSON array only. No markdown fences. No extra text.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ hook: script.hook, body: script.body, cta: script.cta }),
      },
    ],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('video-storyboard agent returned invalid JSON: ' + text.slice(0, 120))
  }

  const result = z.array(VideoShotSchema).safeParse(parsed)
  if (!result.success) {
    throw new Error('video-storyboard agent output failed validation: ' + result.error.message)
  }
  if (result.data.length < 1) {
    throw new Error('video-storyboard agent returned empty shot list')
  }

  return result.data
}
