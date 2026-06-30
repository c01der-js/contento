import { runAnthropicMessage } from '../client.js'

// Generates a complete, ready-to-edit Brand Kit (voice/tone, pillars, vocabulary, personas,
// visual identity) from a company portrait. Output rows are persisted as editable DB records
// by POST /brand-kit/generate, so the user can refine them afterwards (feature: onboarding auto-fill).

export interface BrandKitInput {
  companyName: string
  niche: string
  description: string
  usp: string
  targetAudience: string
  contentAngles: string[]
}

export interface BrandKitTone {
  name: string
  description?: string
  adjectives?: string[]
  values?: string[]
  examplesPositive?: string[]
  examplesNegative?: string[]
  manifesto?: string
}
export interface BrandKitPillar {
  name: string
  description?: string
  keywords?: string[]
}
export interface BrandKitVocabulary {
  word: string
  type: 'ALLOW' | 'FORBID'
}
export interface BrandKitPersona {
  name: string
  description?: string
  painPoints?: string[]
  desires?: string[]
}
export interface BrandKitVisualIdentity {
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fontPrimary?: string
  fontSecondary?: string
}

export interface BrandKitResult {
  tones: BrandKitTone[]
  pillars: BrandKitPillar[]
  vocabulary: BrandKitVocabulary[]
  personas: BrandKitPersona[]
  visualIdentity?: BrandKitVisualIdentity
}

const SCHEMA_INSTRUCTION = `You are a senior brand strategist. From the company portrait below, produce a complete, authentic, ready-to-edit Brand Kit.

IMPORTANT: respond in the SAME LANGUAGE as the company "description"/"niche" (if they are in Russian, write everything in Russian).

Return ONLY valid JSON — no markdown fences, no commentary — with EXACTLY this shape:
{
  "tones": [{ "name": "...", "description": "...", "adjectives": ["..."], "values": ["..."], "examplesPositive": ["..."], "examplesNegative": ["..."], "manifesto": "..." }],
  "pillars": [{ "name": "...", "description": "...", "keywords": ["..."] }],
  "vocabulary": [{ "word": "...", "type": "ALLOW" }, { "word": "...", "type": "FORBID" }],
  "personas": [{ "name": "...", "description": "...", "painPoints": ["..."], "desires": ["..."] }],
  "visualIdentity": { "primaryColor": "#RRGGBB", "secondaryColor": "#RRGGBB", "accentColor": "#RRGGBB", "fontPrimary": "...", "fontSecondary": "..." }
}

Guidance: 2-3 tones, 3-5 pillars, 6-10 vocabulary entries (mix of ALLOW words the brand should use and FORBID words it should avoid), 2-3 personas. Colors must be hex. Make EVERYTHING specific to THIS brand using its niche, USP, target audience and content angles — never generic boilerplate.`

export async function generateBrandKit(workspaceId: string, input: BrandKitInput): Promise<BrandKitResult> {
  const response = await runAnthropicMessage(
    { agent: 'brand-kit-generator', workspaceId },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      system: [{ type: 'text', text: SCHEMA_INSTRUCTION }],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: Partial<BrandKitResult>
  try {
    parsed = JSON.parse(text) as Partial<BrandKitResult>
  } catch {
    throw new Error('brand-kit-generator returned invalid JSON: ' + text.slice(0, 120))
  }

  return {
    tones: Array.isArray(parsed.tones) ? parsed.tones : [],
    pillars: Array.isArray(parsed.pillars) ? parsed.pillars : [],
    vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary.filter((v) => v && typeof v.word === 'string') : [],
    personas: Array.isArray(parsed.personas) ? parsed.personas : [],
    ...(parsed.visualIdentity && typeof parsed.visualIdentity === 'object' ? { visualIdentity: parsed.visualIdentity } : {}),
  }
}
