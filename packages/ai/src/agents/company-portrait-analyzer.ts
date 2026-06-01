import { runAnthropicMessage } from '../client.js'

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

export async function analyzeCompany(
  workspaceId: string,
  input: CompanyInput,
): Promise<CompanyPortraitResult> {
  const response = await runAnthropicMessage(
    { agent: 'company-portrait-analyzer', workspaceId },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: `You are a brand strategist. Analyze the company data and generate a structured brand portrait.
Return ONLY valid JSON with this exact shape:
{
  "niche": "one-line niche description",
  "description": "2-3 sentence brand overview",
  "usp": "unique selling proposition in one sentence",
  "targetAudience": "detailed target audience description",
  "competitors": ["competitor1", "competitor2"],
  "contentAngles": ["angle1", "angle2", "angle3", "angle4", "angle5"]
}

contentAngles are 5-7 unique content perspectives for this brand — specific topics/angles the brand can authentically speak about to engage their audience. Make them specific, not generic.`,
        },
      ],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as CompanyPortraitResult
  } catch {
    throw new Error('company-portrait-analyzer returned invalid JSON: ' + text.slice(0, 120))
  }
}
