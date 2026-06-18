import { z } from 'zod'
import { getPlatformProfile } from '@contento/shared'
import { getAnthropicClient } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export const ShotTypeSchema = z.enum(['avatar', 'broll', 'screencast'])
export type ShotType = z.infer<typeof ShotTypeSchema>

export const ScreencastTemplateSchema = z.enum(['slides', 'chat', 'browser', 'phone-app'])
export type ScreencastTemplate = z.infer<typeof ScreencastTemplateSchema>

// Structured on-screen content per template. Mirror of @contento/brand-kit's
// ScreencastContent TS types — keep the two in sync (renderer consumes the same shape).
export const ScreencastContentSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('slides'), title: z.string().min(1), bullets: z.array(z.string().min(1)).min(1).max(5) }),
  z.object({ template: z.literal('chat'), messages: z.array(z.object({ side: z.enum(['left', 'right']), text: z.string().min(1) })).min(1).max(6) }),
  z.object({ template: z.literal('browser'), url: z.string().min(1), title: z.string().min(1), lines: z.array(z.string().min(1)).min(1).max(4) }),
  z.object({ template: z.literal('phone-app'), appName: z.string().min(1), items: z.array(z.string().min(1)).min(1).max(5) }),
])
export type ScreencastContent = z.infer<typeof ScreencastContentSchema>

export const VideoShotSchema = z.object({
  index: z.number().int().min(0),
  shotType: ShotTypeSchema.default('avatar'),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  headline: z.string().optional(), // on-screen text; required-ish for broll (validated in the prompt, not the schema)
  screencastContent: ScreencastContentSchema.optional(), // required-ish for screencast (enforced in the prompt)
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

  // Plan B2: split shots into avatar / b-roll / screencast by the platform's formatMix.
  const brollCount = profile ? Math.round(profile.formatMix.broll * shotCount) : 0
  const screencastCount = profile ? Math.round(profile.formatMix.screencast * shotCount) : 0
  // Never let non-avatar shots take the first/last slot, and keep >=1 avatar slot for hook+CTA.
  const maxNonAvatar = Math.max(0, shotCount - 2)
  const nonAvatar = Math.min(brollCount + screencastCount, maxNonAvatar)
  const broll = Math.min(brollCount, nonAvatar)
  const screencast = Math.min(screencastCount, nonAvatar - broll)
  const formatLine =
    broll + screencast > 0
      ? `Of the ${shotCount} shots, make exactly ${broll} "broll" and ${screencast} "screencast"; the rest are "avatar". Never put a broll or screencast shot first or last.`
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
          '  shotType   — "avatar", "broll", or "screencast"',
          '  prompt     — visual description (max 30 words). avatar: the person speaking. broll: a scene with NO people/faces. screencast: name the synthetic screen to show.',
          '  dialogue   — the spoken voiceover for this shot (direct quote from the script)',
          '  headline   — REQUIRED for broll: 2–6 words of on-screen text; omit for avatar/screencast',
          '  screencastContent — REQUIRED for screencast only. One JSON object, pick ONE template:',
          '      slides:    { "template":"slides", "title": string, "bullets": string[1..5] }',
          '      chat:      { "template":"chat", "messages": [{ "side":"left"|"right", "text": string }] (1..6) }',
          '      browser:   { "template":"browser", "url": string, "title": string, "lines": string[1..4] }',
          '      phone-app: { "template":"phone-app", "appName": string, "items": string[1..5] }',
          '  durationSec — float (typically 1.5–5)',
          'Rules:',
          '  - First shot is the hook (avatar); last shot is the CTA / ending (avatar)',
          '  - ' + formatLine,
          '  - ' + durationLine,
          '  - b-roll keeps the voiceover in `dialogue`, shows no person, puts a punchy phrase in `headline`',
          '  - screencast keeps the voiceover in `dialogue`; all on-screen words go in `screencastContent` (Russian, short)',
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
