import { runAnthropicMessage, currentDateContext } from '../client.js'

export interface CompanyInput {
  companyName: string
  niche: string
  website?: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
}

export interface CompanyPortraitResult {
  niche: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
  contentAngles: string[]
}

const SYSTEM_TEXT = `You are a brand strategist with live web access. Analyze the company data and generate a structured brand portrait.

${currentDateContext()}

Use the web_search tool to ground "contentAngles" in REAL, CURRENT trends and conversations in this brand's niche and audience RIGHT NOW. Search before writing the angles — do not rely on memory or invent topics.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "niche": "one-line niche description",
  "description": "2-3 sentence brand overview",
  "usp": "unique selling proposition in one sentence",
  "targetAudience": "detailed target audience description",
  "competitors": ["competitor1", "competitor2"],
  "contentAngles": ["angle1", "angle2", "angle3", "angle4", "angle5"]
}

Respond in the SAME LANGUAGE as the company "description"/"niche" (if Russian, write everything in Russian).
contentAngles are 5-7 unique content perspectives for this brand — specific, timely topics the brand can authentically speak about to engage their audience NOW. Make them specific and current, never generic or dated.`

/** Pull the JSON object out of a response that may interleave web_search tool blocks. */
function extractJsonObject(response: Awaited<ReturnType<typeof runAnthropicMessage>>): string {
  // With web_search the final answer is the LAST text block; tool-use/result blocks come before it.
  const texts = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : []))
  let text = (texts.length ? texts[texts.length - 1]! : '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  if (!text.startsWith('{')) {
    const open = text.indexOf('{')
    const close = text.lastIndexOf('}')
    if (open !== -1 && close > open) text = text.slice(open, close + 1)
  }
  return text
}

export async function analyzeCompany(
  workspaceId: string,
  input: CompanyInput,
): Promise<CompanyPortraitResult> {
  const meta = { agent: 'company-portrait-analyzer', workspaceId }
  const base = {
    model: 'claude-sonnet-4-6' as const,
    max_tokens: 3000,
    system: [{ type: 'text' as const, text: SYSTEM_TEXT }],
    messages: [{ role: 'user' as const, content: JSON.stringify(input) }],
  }

  let response
  try {
    // Live web access so contentAngles reflect CURRENT trends, not the model's
    // stale training-era memory (which produced outdated "2024" topics).
    response = await runAnthropicMessage(meta, {
      ...base,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    })
  } catch (err) {
    // Web search is a billed server tool; if it's unavailable on the account, fall
    // back to a date-aware call without it (date grounding alone already fixes "2024").
    console.warn('[company-portrait-analyzer] web_search failed, retrying without it:', err)
    response = await runAnthropicMessage(meta, base)
  }

  const text = extractJsonObject(response)
  try {
    return JSON.parse(text) as CompanyPortraitResult
  } catch {
    throw new Error('company-portrait-analyzer returned invalid JSON: ' + text.slice(0, 120))
  }
}
