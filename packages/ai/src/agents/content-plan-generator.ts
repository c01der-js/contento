import { runAnthropicMessage } from '../client.js'
import type { CompanyPortraitResult } from './company-portrait-analyzer.js'

export interface ContentPlanRequest {
  portrait: CompanyPortraitResult
  goal: 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'
  targetAction: string
  startsAt: string
  endsAt: string
  virloTrends?: Array<{ title: string; views?: number; platform?: string }>
}

export interface ContentPlanItemDraft {
  index: number
  topic: string
  format: string
  scheduledDate: string
  hook: string
}

const GOAL_LABELS: Record<string, string> = {
  SUBSCRIBERS: 'grow subscribers/followers',
  SALES: 'drive sales and conversions',
  ENGAGEMENT: 'maximize engagement (likes, comments, shares)',
  REACH: 'maximize reach and brand awareness',
}

const HOOK_FORMULAS = `
Proven hook formulas to choose from:
- Pattern Interrupt: "Stop scrolling if you [relatable situation]"
- Bold Claim: "[Surprising statistic or counterintuitive statement]"
- Question Hook: "Did you know that [unexpected fact about niche]?"
- Story Hook: "I [made mistake / discovered secret] and here's what happened"
- Curiosity Gap: "The one thing [target audience] never does — but should"
- Direct CTA: "Watch this before you [common mistake in niche]"
`

export async function generateContentPlan(
  workspaceId: string,
  request: ContentPlanRequest,
): Promise<ContentPlanItemDraft[]> {
  const start = new Date(request.startsAt)
  const end = new Date(request.endsAt)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const videoCount = Math.min(Math.max(Math.floor(days / 3), 3), 20)

  const trendsSection = request.virloTrends?.length
    ? `\nTrending videos in this niche:\n${request.virloTrends.slice(0, 10).map(t => `- "${t.title}"${t.views ? ` (${t.views} views)` : ''}`).join('\n')}`
    : ''

  const response = await runAnthropicMessage(
    { agent: 'content-plan-generator', workspaceId },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: `You are a social media content strategist. Generate a video content plan.
${HOOK_FORMULAS}
Return ONLY valid JSON array with exactly ${videoCount} items. Each item:
{
  "index": 0,
  "topic": "specific video topic",
  "format": "reel",
  "scheduledDate": "YYYY-MM-DD",
  "hook": "exact opening hook text (max 15 words, from the proven formulas above)"
}

Distribute scheduledDates evenly between ${request.startsAt.slice(0, 10)} and ${request.endsAt.slice(0, 10)}.
All hooks must drive the goal: ${GOAL_LABELS[request.goal]}.
CTA direction for all videos: "${request.targetAction}".`,
        },
      ],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            brand: {
              niche: request.portrait.niche,
              usp: request.portrait.usp,
              targetAudience: request.portrait.targetAudience,
              contentAngles: request.portrait.contentAngles,
            },
            goal: request.goal,
            targetAction: request.targetAction,
            trendsSection,
          }),
        },
      ],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const items = JSON.parse(text) as ContentPlanItemDraft[]
    return items.map((item, i) => ({ ...item, index: i }))
  } catch {
    throw new Error('content-plan-generator returned invalid JSON: ' + text.slice(0, 120))
  }
}
