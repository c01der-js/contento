import { z } from 'zod'
import { ContentFormatSchema, SocialPlatformSchema } from '../types.js'

export const TOPIC_CONTENT = 'content' as const

export const IdeaRequestedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  trendId: z.string().cuid(),
  requestedBy: z.string().cuid(),
})
export type IdeaRequested = z.infer<typeof IdeaRequestedSchema>

export const ScriptRequestedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  ideaId: z.string().cuid(),
  format: ContentFormatSchema,
  platform: SocialPlatformSchema,
  requestedBy: z.string().cuid(),
})
export type ScriptRequested = z.infer<typeof ScriptRequestedSchema>

export const RenderRequestedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string().cuid(),
  timestamp: z.string().datetime({ offset: false }),
  scriptId: z.string().cuid(),
  templateId: z.string().min(1),
  platform: SocialPlatformSchema,
})
export type RenderRequested = z.infer<typeof RenderRequestedSchema>
