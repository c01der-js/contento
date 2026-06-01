import { z } from 'zod'
import { TrendSourceSchema } from '../types.js'

export const TOPIC_TRENDS = 'trends' as const

export const TrendDiscoveredSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  trendId: z.string().cuid(),
  title: z.string().min(1),
  url: z.string().url().optional(),
  source: TrendSourceSchema,
  relevanceScore: z.number().finite().min(0).max(1).optional(),
})

export type TrendDiscovered = z.infer<typeof TrendDiscoveredSchema>

export const TOPIC_TRENDS_ANALYZED = 'trends.analyzed' as const

export const TrendAnalyzedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  trendId: z.string().cuid(),
  score: z.number().finite().min(0).max(100),
  summary: z.string(),
  category: z.string().optional(),
})

export type TrendAnalyzed = z.infer<typeof TrendAnalyzedSchema>
