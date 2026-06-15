import { z } from 'zod'

export const SocialPlatformSchema = z.enum([
  'telegram', 'instagram', 'tiktok', 'youtube', 'linkedin',
])
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>
export const SOCIAL_PLATFORMS = SocialPlatformSchema.options

export const ContentFormatSchema = z.enum(['short_video', 'carousel', 'story', 'long_form'])
export type ContentFormat = z.infer<typeof ContentFormatSchema>
export const CONTENT_FORMATS = ContentFormatSchema.options

export const TrendSourceSchema = z.enum([
  'manual', 'tiktok', 'x', 'google_trends', 'youtube', 'reddit', 'rss', 'competitor', 'adhoc', 'virlo',
])
export type TrendSource = z.infer<typeof TrendSourceSchema>
export const TREND_SOURCES = TrendSourceSchema.options
