import { getPlatformProfile, type PlatformProfile } from '@contento/shared'
import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'
import { buildGoldenExamplesBlock } from '../golden-examples.js'

export interface ContentScript {
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
}

const SCHEMA_INSTRUCTION = `You are a professional social media scriptwriter. Write compelling content that sounds human, not AI-generated.

Respond with valid JSON only — no markdown fences, no extra keys. Use exactly this structure:
{
  "hook": "<opening line that stops the scroll>",
  "body": "<main script body>",
  "cta": "<call to action>",
  "caption": "<post caption>",
  "hashtags": ["#tag1", "#tag2"]
}`

function platformInstruction(platform: string, profileOverride?: PlatformProfile): string {
  const p = profileOverride ?? getPlatformProfile(platform)
  const captionGuide =
    p.captionStyle === 'seo-keyword-first'
      ? 'Write the caption SEO-first: lead with the keyword phrase a viewer would search; the platform indexes caption + on-screen text + voiceover.'
      : 'Write the caption conversational and hook-forward in colloquial Russian; open a curiosity/comment loop.'
  return [
    `Target platform: ${p.platform}.`,
    `The spoken script must fit a ${p.targetDurationSec.min}-${p.targetDurationSec.max}s video (aim ${p.targetDurationSec.ideal}s, ~${Math.round(p.targetDurationSec.ideal * 2.5)} words of voiceover).`,
    `The hook must land within the first ${p.hookWindowSec} seconds.`,
    captionGuide,
    `Caption max ${p.captionMaxLen} characters. Provide exactly ${p.hashtagCount} hashtags.`,
    'Write all output in Russian.',
  ].join('\n')
}

function validateScript(data: unknown): ContentScript {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Agent response is not a JSON object')
  }
  const d = data as Record<string, unknown>
  const required = ['hook', 'body', 'cta', 'caption', 'hashtags'] as const
  for (const key of required) {
    if (d[key] == null) throw new Error(`Agent response missing required field: "${key}"`)
  }
  if (!Array.isArray(d['hashtags'])) throw new Error('Agent response field "hashtags" must be an array')
  return d as unknown as ContentScript
}

export async function writeScript(
  workspaceId: string,
  idea: { title: string; angle: string; format: string; platform: string },
  profile?: PlatformProfile,
): Promise<ContentScript> {
  const { systemBlock } = await buildBrandContext(workspaceId)
  const goldenBlock = await buildGoldenExamplesBlock(workspaceId, `${idea.title}\n${idea.angle}`)

  const response = await runAnthropicMessage({ agent: 'scriptwriter', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      systemBlock,
      { type: 'text', text: SCHEMA_INSTRUCTION },
      { type: 'text', text: platformInstruction(idea.platform, profile) },
      ...(goldenBlock ? [{ type: 'text' as const, text: goldenBlock }] : []),
    ],
    messages: [{ role: 'user', content: JSON.stringify(idea) }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }

  return validateScript(parsed)
}
