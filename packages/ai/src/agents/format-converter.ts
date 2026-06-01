import { runAnthropicMessage } from '../client.js'
import type { BrandContext } from '../brand-context.js'

export interface ConvertedScript {
  hook: string
  body: string
  cta: string
  captions: Record<string, string>
}

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  CarouselPost: [
    'Convert this script into a carousel post format.',
    'Split the body content into exactly 5 slide texts.',
    'Return "hook" as the carousel title/cover text.',
    'Return "body" as a brief intro summary (1-2 sentences).',
    'Return "cta" unchanged or adapted for carousel swipe.',
    'Return "captions" as an object with keys "slide1" through "slide5", each containing the slide text (max 50 words per slide).',
  ].join(' '),

  VideoReels: [
    'Convert this script into a short video Reels format.',
    'Shorten the body to a 60-second voiceover script (~150 words).',
    'Add visual cue markers in square brackets (e.g., [cut to product], [zoom in]) throughout the body.',
    'Return "hook" as the opening 3-second hook line.',
    'Return "body" as the shortened script with visual cues.',
    'Return "cta" as a concise end-screen call to action.',
    'Return "captions" as an object with a single "caption" key containing the Instagram/TikTok post caption (max 150 chars).',
  ].join(' '),

  SingleImagePost: [
    'Convert this script into a single image post format.',
    'Compress the entire content into one impactful image caption.',
    'Return "hook" as a bold opening line (max 10 words) for the image overlay text.',
    'Return "body" as empty string (content goes into the caption).',
    'Return "cta" as a short call-to-action (max 8 words).',
    'Return "captions" as an object with a single "caption" key containing the full post caption (hook + story + CTA, max 300 chars).',
  ].join(' '),

  LongReadArticle: [
    'Convert this script into a long-read article format.',
    'Expand the body to 800+ words with rich detail, examples, and storytelling.',
    'Return "hook" as the article headline.',
    'Return "body" as the full expanded article text (800+ words).',
    'Return "cta" as the article closing paragraph with a call to action.',
    'Return "captions" as an object with "summary" key containing a 2-sentence TL;DR summary.',
  ].join(' '),
}

export async function convertFormat(
  script: { hook: string; body: string; cta: string; captions?: Record<string, string> },
  targetFormat: string,
  brandContext: BrandContext,
): Promise<ConvertedScript> {
  const formatInstruction = FORMAT_INSTRUCTIONS[targetFormat]
    ?? `Convert this script into "${targetFormat}" format. Adapt hook, body, and cta appropriately. Return "captions" as an object with a "caption" key.`

  const response = await runAnthropicMessage(
    { agent: 'format-converter', workspaceId: brandContext.workspaceId },
    {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [
      brandContext.systemBlock,
      {
        type: 'text',
        text: [
          'You are a professional social media content strategist and copywriter.',
          'Your task is to reformat a script for a specific content format while preserving the brand voice.',
          formatInstruction,
          'Respond with valid JSON only. The JSON must have exactly these keys: hook (string), body (string), cta (string), captions (object with string values).',
          'No markdown fences. No extra keys.',
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          targetFormat,
          script: {
            hook: script.hook,
            body: script.body,
            cta: script.cta,
            captions: script.captions ?? {},
          },
        }),
      },
    ],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as ConvertedScript
    if (typeof parsed.hook !== 'string' || typeof parsed.body !== 'string' || typeof parsed.cta !== 'string') {
      throw new Error('Missing required fields')
    }
    if (!parsed.captions || typeof parsed.captions !== 'object') {
      parsed.captions = {}
    }
    return parsed
  } catch {
    throw new Error('format-converter returned invalid JSON: ' + text.slice(0, 120))
  }
}
