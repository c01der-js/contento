import { z } from 'zod'
import { getPlatformProfile } from '@contento/shared'
import { getAnthropicClient } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export const ShotTypeSchema = z.enum(['avatar', 'broll', 'screencast'])
export type ShotType = z.infer<typeof ShotTypeSchema>

export const VideoShotSchema = z.object({
  index: z.number().int().min(0),
  shotType: ShotTypeSchema.default('avatar'),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  headline: z.string().optional(), // on-screen text; required-ish for broll (validated in the prompt, not the schema)
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
  options?: { shotCount?: number; characterDescription?: string; language?: string; platform?: string },
): Promise<VideoShot[]> {
  const client = getAnthropicClient()
  const { systemBlock } = await buildBrandContext(workspaceId)

  const profile = options?.platform ? getPlatformProfile(options.platform) : undefined
  const durationLine = profile
    ? `Total video duration MUST be ${profile.targetDurationSec.min}-${profile.targetDurationSec.max} seconds (aim ${profile.targetDurationSec.ideal}s). The hook (first shot) must land within ${profile.hookWindowSec}s.`
    : 'Total duration should be 15–60 seconds.'
  const shotCount = options?.shotCount ?? 5

  // Plan B: split shots into avatar vs b-roll by the platform's formatMix.
  // screencast weight folds into avatar until Plan B2 ships the synthetic renderer.
  const brollCount = profile ? Math.round(profile.formatMix.broll * shotCount) : 0
  const formatLine = brollCount > 0
    ? `Of the ${shotCount} shots, make exactly ${brollCount} a "broll" shot and the rest "avatar". Spread the b-roll shots through the middle (never the first or last shot).`
    : 'Every shot is an "avatar" shot.'
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
          '  shotType   — "avatar" or "broll"',
          '  prompt     — visual/cinematic description (max 30 words). For avatar: the person speaking. For broll: a scene with NO people and NO faces (objects, places, screens, hands, textures).',
          '  dialogue   — the spoken voiceover for this shot (direct quote from the script); omit only for a purely visual beat',
          '  headline   — REQUIRED for broll: 2–6 words of on-screen text; omit for avatar',
          '  durationSec — float, how long this shot should be (typically 1.5–5)',
          'Rules:',
          '  - First shot must be the hook (avatar); last shot must be the CTA / ending (avatar)',
          '  - ' + formatLine,
          '  - ' + durationLine,
          '  - b-roll shots keep the voiceover in `dialogue` but show no person; put the punchy phrase in `headline`',
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
