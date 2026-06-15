import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'

const YOUTUBE_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const WATCH_URL = 'https://www.youtube.com/watch'

interface YouTubeCreds {
  accessToken: string
  refreshToken: string
  clientId: string
  clientSecret: string
}

interface VideoResource {
  id: string
}

export class YouTubePublisher implements PlatformPublisher {
  constructor(private creds: YouTubeCreds) {}

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const videoUrl = payload.videoUrl ?? payload.imageUrl
    if (!videoUrl) throw new Error('YouTube requires a video URL')

    const title = payload.text.slice(0, 100)
    const description = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    const videoMeta = {
      snippet: { title, description, tags: payload.hashtags ?? [] },
      status: { privacyStatus: 'public' as const },
    }

    return this.withAuthRetry(async () => {
      const { body, contentLength, contentType } = await fetchVideoBody(videoUrl)
      const uploadUrl = await this.initResumableUpload(videoMeta, contentLength, contentType)
      const video = await this.uploadVideoBody(uploadUrl, body, contentLength, contentType)
      return {
        platformPostId: video.id,
        url: `${WATCH_URL}?v=${video.id}`,
      }
    })
  }

  private async initResumableUpload(
    meta: unknown,
    contentLength: number | null,
    contentType: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=UTF-8',
      Authorization: `Bearer ${this.creds.accessToken}`,
      'X-Upload-Content-Type': contentType,
    }
    if (contentLength != null) {
      headers['X-Upload-Content-Length'] = String(contentLength)
    }

    const res = await fetch(
      `${YOUTUBE_UPLOAD}/videos?uploadType=resumable&part=snippet,status`,
      { method: 'POST', headers, body: JSON.stringify(meta) },
    )
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`YouTube upload init failed: ${res.status} ${text}`)
    }

    const uploadUrl = res.headers.get('Location')
    if (!uploadUrl) throw new Error('YouTube did not return upload URL')
    return uploadUrl
  }

  private async uploadVideoBody(
    uploadUrl: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    contentLength: number | null,
    contentType: string,
  ): Promise<VideoResource> {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      Authorization: `Bearer ${this.creds.accessToken}`,
    }
    if (contentLength != null) {
      headers['Content-Length'] = String(contentLength)
    }

    const init: Record<string, unknown> = {
      method: 'PUT',
      headers,
      body,
    }
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
      init.duplex = 'half'
    }

    const res = await fetch(uploadUrl, init as Parameters<typeof fetch>[1])
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`YouTube upload failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as Partial<VideoResource>
    if (!data.id) throw new Error('YouTube upload succeeded but did not return a video id')
    return { id: data.id }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.creds.refreshToken) {
      throw new Error('YouTube access token expired and no refresh token is available')
    }
    const form = new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      refresh_token: this.creds.refreshToken,
      grant_type: 'refresh_token',
    })
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`YouTube token refresh failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) {
      throw new Error('YouTube token refresh returned no access_token')
    }
    this.creds = { ...this.creds, accessToken: data.access_token }
  }

  private async withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        await this.refreshAccessToken()
        return await fn()
      }
      throw err
    }
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('YouTube returned 401')
    this.name = 'UnauthorizedError'
  }
}

async function fetchVideoBody(url: string): Promise<{
  body: ReadableStream<Uint8Array> | Uint8Array
  contentLength: number | null
  contentType: string
}> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch video from ${url}: ${res.status}`)
  }
  const contentType = res.headers.get('content-type') ?? 'video/mp4'
  const lenHeader = res.headers.get('content-length')
  const contentLength = lenHeader ? Number(lenHeader) : null

  if (res.body) {
    return { body: res.body, contentLength, contentType }
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  return { body: buf, contentLength: buf.byteLength, contentType }
}
