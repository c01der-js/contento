export type HiggsfieldJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw'

export interface HiggsfieldJobResult {
  status: HiggsfieldJobStatus
  outputUrl?: string
  error?: string
}

export interface HiggsfieldWebhookPayload {
  job_id: string
  status: 'completed' | 'failed'
  output_url?: string
  error?: string
}
