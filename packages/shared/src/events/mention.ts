import { z } from 'zod'

export const TOPIC_MENTION = 'mentions' as const

export const MentionDetectedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string(),
  timestamp: z.string().datetime({ offset: false }),
  mentionId: z.string(),
  source: z.string(),
  url: z.string().url(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  urgency: z.number().int().min(0).max(10),
})
export type MentionDetected = z.infer<typeof MentionDetectedSchema>
