import { z } from 'zod'

export const TOPIC_LORA = 'lora' as const

export const LoraTrainRequestedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string(),
  timestamp: z.string().datetime({ offset: false }),
  jobId: z.string(),
  assetPrefix: z.string(),
})
export type LoraTrainRequested = z.infer<typeof LoraTrainRequestedSchema>

export const LoraTrainCompletedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string(),
  timestamp: z.string().datetime({ offset: false }),
  jobId: z.string(),
  weightsUrl: z.string().url(),
})
export type LoraTrainCompleted = z.infer<typeof LoraTrainCompletedSchema>

export const LoraTrainFailedSchema = z.object({
  eventId: z.string().uuid(),
  workspaceId: z.string(),
  timestamp: z.string().datetime({ offset: false }),
  jobId: z.string(),
  error: z.string(),
})
export type LoraTrainFailed = z.infer<typeof LoraTrainFailedSchema>
