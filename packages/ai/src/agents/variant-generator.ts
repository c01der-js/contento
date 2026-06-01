import { z } from 'zod'
import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'
import type { BrandContext } from '../brand-context.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScriptVariant {
  label: string
  hook: string
  caption: string
}

export interface CoverConcept {
  composition: string
  palette: string[]
  textOverlay: string
  imagePrompt: string
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CoverConceptSchema = z.object({
  composition: z.string(),
  palette: z.array(z.string()),
  textOverlay: z.string(),
  imagePrompt: z.string(),
})

const CoverConceptArraySchema = z.array(CoverConceptSchema)

// ---------------------------------------------------------------------------
// generateVariants — existing text A/B variant generator
// ---------------------------------------------------------------------------

export async function generateVariants(
  workspaceId: string,
  script: { hook: string; caption: string },
  count = 2,
): Promise<ScriptVariant[]> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const response = await runAnthropicMessage({ agent: 'variant-generator', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      systemBlock,
      {
        type: 'text',
        text: `Generate ${count} alternative A/B test variants for this script. Each variant should have a different hook angle and caption style. Return a JSON array of objects with fields: label (string, 'B' for first, 'C' for second, etc.), hook (string), caption (string). No markdown fences.`,
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(script) }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as ScriptVariant[]
    return parsed
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }
}

// ---------------------------------------------------------------------------
// generateCoverVariants — visual cover concept generator (US-021)
// ---------------------------------------------------------------------------

export async function generateCoverVariants(
  script: { hook: string; body: string; cta: string },
  brandContext: BrandContext,
  count = 3,
): Promise<CoverConcept[]> {
  const response = await runAnthropicMessage(
    { agent: 'cover-variants', workspaceId: brandContext.workspaceId },
    {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      brandContext.systemBlock,
      {
        type: 'text',
        text: [
          'You are a visual creative director specialising in social media cover design.',
          `Generate ${count} distinct visual directions for a cover image based on the script content.`,
          'Each direction must be meaningfully different in composition, colour palette, and mood.',
          'For each variant return a JSON object with:',
          '  composition  — layout description (e.g. "bold centered text on blurred background")',
          '  palette      — array of 2-4 hex colour codes that match the brand',
          '  textOverlay  — short text (8 words or fewer) to display on the cover',
          '  imagePrompt  — detailed Stable Diffusion / DALL-E prompt for the background image',
          `Respond with a JSON array of exactly ${count} objects. No markdown, no extra text.`,
        ].join('\n'),
      },
    ],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ hook: script.hook, body: script.body, cta: script.cta, count }),
      },
    ],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text)
    return CoverConceptArraySchema.parse(parsed)
  } catch {
    throw new Error('Agent returned invalid JSON for cover variants: ' + text.slice(0, 120))
  }
}
