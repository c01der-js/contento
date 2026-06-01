import { z } from 'zod'
import { SocialPlatformSchema } from '../types.js'

export const TOPIC_PUBLISH = 'publish' as const

export const PublishRequestedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  publicationId: z.string().cuid(),
  platform: SocialPlatformSchema,
  scheduledAt: z.string().datetime({ offset: false }).optional(),
})
export type PublishRequested = z.infer<typeof PublishRequestedSchema>

export const PublishCompletedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  publicationId: z.string().cuid(),
  platform: SocialPlatformSchema,
  externalId: z.string().min(1),
  publishedAt: z.string().datetime({ offset: false }),
  url: z.string().url().optional(),
})
export type PublishCompleted = z.infer<typeof PublishCompletedSchema>

export const PublishFailedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  publicationId: z.string().cuid(),
  platform: SocialPlatformSchema,
  error: z.string(),
  retryable: z.boolean(),
})
export type PublishFailed = z.infer<typeof PublishFailedSchema>
