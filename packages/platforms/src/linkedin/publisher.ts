import type { PlatformPublisher, PublishPayload, PublishResult, PostMetrics } from '../types.js'
import { requestWithRetry, throwForResponse } from '../lib/http.js'

const LINKEDIN_API = 'https://api.linkedin.com/v2'
const PLATFORM = 'linkedin'

export class LinkedInPublisher implements PlatformPublisher {
  constructor(private readonly creds: { accessToken: string; ownerUrn: string }) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const text = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text: text.slice(0, 3000) },
      shareMediaCategory: 'NONE',
    }

    const res = await requestWithRetry(PLATFORM, `${LINKEDIN_API}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.creds.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: this.creds.ownerUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, 'ugcPosts')

    const postId = res.headers.get('X-RestLi-Id') ?? res.headers.get('x-restli-id')
    if (postId) return { platformPostId: postId }

    const data = (await res.json()) as { id?: string }
    if (!data.id) throw new Error('LinkedIn did not return post ID')
    return { platformPostId: data.id }
  }

  // Organization/share statistics need additional partner permissions (not yet provisioned).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
}
