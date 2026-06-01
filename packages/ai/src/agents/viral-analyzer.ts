import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export interface ViralInsight {
  hook: string
  emotion: string
  format: string
  timing: string
  actionableLesson: string
}

export async function analyzeViralVideo(
  video: {
    title: string
    description?: string
    url?: string
    outlierRatio?: number
    views?: number
    likes?: number
  },
  workspaceId?: string,
): Promise<ViralInsight> {
  const brand = workspaceId ? await buildBrandContext(workspaceId) : null

  const prompt = `Analyze why this social media video went viral and extract one actionable lesson for a content creator working on the brand described above (if any).

Video:
Title: ${video.title}
${video.description ? `Description: ${video.description}` : ''}
${video.url ? `URL: ${video.url}` : ''}
${video.outlierRatio !== undefined ? `Outlier ratio (viral score): ${video.outlierRatio}` : ''}
${video.views !== undefined ? `Views: ${video.views}` : ''}
${video.likes !== undefined ? `Likes: ${video.likes}` : ''}

Respond with JSON only (no markdown fences):
{
  "hook": "what made the opening irresistible",
  "emotion": "primary emotion it triggered (curiosity/surprise/inspiration/humor/etc)",
  "format": "structural element that worked (e.g. 'problem-solution loop', 'before/after reveal')",
  "timing": "why this resonated NOW (trend alignment, cultural moment, platform algorithm)",
  "actionableLesson": "one concrete thing this brand can replicate in their next video — keep it aligned with the pillars and voice listed above"
}`

  const response = await runAnthropicMessage(
    { agent: 'viral-analyzer', workspaceId: workspaceId ?? null },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      ...(brand ? { system: [brand.systemBlock] } : {}),
      messages: [{ role: 'user', content: prompt }],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as ViralInsight
  } catch {
    throw new Error('viral-analyzer returned invalid JSON: ' + text.slice(0, 100))
  }
}
