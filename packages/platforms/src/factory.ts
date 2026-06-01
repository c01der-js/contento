import { TelegramPublisher } from './telegram/publisher.js'
import { InstagramPublisher } from './instagram/publisher.js'
import { TikTokPublisher } from './tiktok/publisher.js'
import { YouTubePublisher } from './youtube/publisher.js'
import { LinkedInPublisher } from './linkedin/publisher.js'
import { VKPublisher } from './vk/publisher.js'
import type { PlatformPublisher } from './types.js'

export function createPublisher(
  platform: string,
  credentials: Record<string, unknown>
): PlatformPublisher {
  switch (platform) {
    case 'telegram': {
      const { botToken, channelId } = credentials
      if (typeof botToken !== 'string' || typeof channelId !== 'string')
        throw new Error('telegram credentials must include botToken and channelId')
      return new TelegramPublisher({ botToken, channelId })
    }
    case 'instagram': {
      const { accessToken, igUserId } = credentials
      if (typeof accessToken !== 'string' || typeof igUserId !== 'string')
        throw new Error('instagram credentials must include accessToken and igUserId')
      return new InstagramPublisher({ accessToken, igUserId })
    }
    case 'tiktok': {
      const { accessToken, openId } = credentials
      if (typeof accessToken !== 'string' || typeof openId !== 'string')
        throw new Error('tiktok credentials must include accessToken and openId')
      return new TikTokPublisher({ accessToken, openId })
    }
    case 'youtube': {
      const { accessToken, refreshToken, clientId, clientSecret } = credentials
      if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' ||
          typeof clientId !== 'string' || typeof clientSecret !== 'string')
        throw new Error('youtube credentials must include accessToken, refreshToken, clientId and clientSecret')
      return new YouTubePublisher({ accessToken, refreshToken, clientId, clientSecret })
    }
    case 'linkedin': {
      const { accessToken, ownerUrn } = credentials
      if (typeof accessToken !== 'string' || typeof ownerUrn !== 'string')
        throw new Error('linkedin credentials must include accessToken and ownerUrn')
      return new LinkedInPublisher({ accessToken, ownerUrn })
    }
    case 'vk': {
      const { accessToken, ownerId } = credentials
      if (typeof accessToken !== 'string' || typeof ownerId !== 'string')
        throw new Error('vk credentials must include accessToken and ownerId')
      return new VKPublisher({ accessToken, ownerId })
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}
