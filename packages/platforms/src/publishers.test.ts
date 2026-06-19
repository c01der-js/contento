import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelegramPublisher } from './telegram/publisher.js'
import { InstagramPublisher } from './instagram/publisher.js'
import { TikTokPublisher } from './tiktok/publisher.js'
import { YouTubePublisher } from './youtube/publisher.js'
import { LinkedInPublisher } from './linkedin/publisher.js'
import { createPublisher } from './factory.js'

// Helper to build a minimal Response-like object
function mockResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('TelegramPublisher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('text only: calls sendMessage and returns platformPostId', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, result: { message_id: 42 } })
    )

    const publisher = new TelegramPublisher({ botToken: 'tok', channelId: '@chan' })
    const result = await publisher.publish({ text: 'Hello world' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]]
    expect(url).toContain('/sendMessage')
    expect(result.platformPostId).toBe('42')
  })

  it('with image: calls sendPhoto endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, result: { message_id: 99 } })
    )

    const publisher = new TelegramPublisher({ botToken: 'tok', channelId: '@chan' })
    const result = await publisher.publish({ text: 'Caption', imageUrl: 'https://example.com/img.png' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]]
    expect(url).toContain('/sendPhoto')
    expect(result.platformPostId).toBe('99')
  })

  it('API error: throws with description', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, description: 'Bad token' })
    )

    const publisher = new TelegramPublisher({ botToken: 'bad', channelId: '@chan' })
    await expect(publisher.publish({ text: 'Hi' })).rejects.toThrow('Bad token')
  })

  it('hashtags are appended to text', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, result: { message_id: 7 } })
    )

    const publisher = new TelegramPublisher({ botToken: 'tok', channelId: '@chan' })
    await publisher.publish({ text: 'Post text', hashtags: ['foo', 'bar'] })

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)
    expect(body.text).toBe('Post text\n\n#foo #bar')
  })

  it('with video: calls sendVideo with the video URL and supports_streaming', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, result: { message_id: 123 } })
    )
    const publisher = new TelegramPublisher({ botToken: 'tok', channelId: '@chan' })
    const result = await publisher.publish({ text: 'Cap', videoUrl: 'https://x/v.mp4', imageUrl: 'https://x/i.png' })

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toContain('/sendVideo')
    const body = JSON.parse(init.body)
    expect(body.video).toBe('https://x/v.mp4')
    expect(body.supports_streaming).toBe(true)
    expect(result.platformPostId).toBe('123')
  })
})

describe('InstagramPublisher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('creates container then publishes and returns platformPostId', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ id: 'container-123' }))
      .mockResolvedValueOnce(mockResponse({ id: 'media-456' }))

    const publisher = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid' })

    const publishPromise = publisher.publish({
      text: 'Hello',
      imageUrl: 'https://example.com/img.png',
    })

    // Advance fake timers past the 5s delay
    await vi.runAllTimersAsync()

    const result = await publishPromise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstOptions] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [secondUrl, secondOptions] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(firstUrl).toContain('/media')
    expect(firstUrl).not.toContain('access_token')
    expect((firstOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
    expect(secondUrl).toContain('/media_publish')
    expect(secondUrl).not.toContain('access_token')
    expect((secondOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
    expect(result.platformPostId).toBe('media-456')
    expect(result.url).toBeUndefined()
  })

  it('throws immediately when no imageUrl', async () => {
    const publisher = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid' })
    await expect(publisher.publish({ text: 'No image' })).rejects.toThrow(
      'Instagram requires an image URL'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('with video: creates REELS container, polls FINISHED, then publishes', async () => {
    vi.useRealTimers()
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'cont1' }))        // container create
    fetchMock.mockResolvedValueOnce(mockResponse({ status_code: 'FINISHED' })) // status poll
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'media1' }))       // media_publish

    const publisher = new InstagramPublisher({ accessToken: 'tok', igUserId: 'u1' })
    const result = await publisher.publish({ text: 'Cap', videoUrl: 'https://x/v.mp4' })

    const createBody = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)
    expect(createBody.media_type).toBe('REELS')
    expect(createBody.video_url).toBe('https://x/v.mp4')
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('cont1?fields=status_code')
    expect(result.platformPostId).toBe('media1')
  }, 15000)
})

describe('createPublisher', () => {
  it('throws for unknown platform', () => {
    expect(() => createPublisher('unknown', {})).toThrow('Unsupported platform: unknown')
  })

  it('throws for tiktok with missing credentials', () => {
    expect(() => createPublisher('tiktok', {})).toThrow('tiktok credentials must include')
  })

  it('returns TelegramPublisher for valid telegram credentials', () => {
    const publisher = createPublisher('telegram', { botToken: 'tok', channelId: '@chan' })
    expect(publisher).toBeInstanceOf(TelegramPublisher)
  })

  it('throws for telegram with missing credentials', () => {
    expect(() => createPublisher('telegram', { botToken: 'tok' })).toThrow(
      'telegram credentials must include botToken and channelId'
    )
  })

  it('returns InstagramPublisher for valid instagram credentials', () => {
    const publisher = createPublisher('instagram', { accessToken: 'tok', igUserId: 'uid' })
    expect(publisher).toBeInstanceOf(InstagramPublisher)
  })

  it('throws for instagram with missing credentials', () => {
    expect(() => createPublisher('instagram', { accessToken: 'tok' })).toThrow(
      'instagram credentials must include accessToken and igUserId'
    )
  })
})

describe('TikTokPublisher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path: publish with imageUrl, returns platformPostId', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ data: { publish_id: 'tiktok-pub-123' } })
    )

    const publisher = new TikTokPublisher({ accessToken: 'tok', openId: 'open-id' })
    const result = await publisher.publish({ text: 'Hello TikTok', imageUrl: 'https://example.com/video.mp4' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]]
    expect(url).toContain('/post/publish/inbox/video/init/')
    expect(result.platformPostId).toBe('tiktok-pub-123')
  })

  it('missing credentials: createPublisher throws', () => {
    expect(() => createPublisher('tiktok', {})).toThrow('tiktok credentials must include')
  })
})

describe('YouTubePublisher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path: downloads video, inits resumable upload, PUTs body, returns videoId', async () => {
    const initHeaders = new Map<string, string>([
      ['Location', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session-abc123'],
    ])
    const videoHeaders = new Map<string, string>([
      ['content-type', 'video/mp4'],
      ['content-length', '7'],
    ])

    // 1. GET source video → returns Uint8Array (no body stream in test)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (k: string) => videoHeaders.get(k.toLowerCase()) ?? null },
      body: null,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4, 5, 6, 7]).buffer),
    } as unknown as Response)

    // 2. POST init resumable upload → returns Location header
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (k: string) => initHeaders.get(k) ?? null },
      json: () => Promise.resolve({}),
    } as unknown as Response)

    // 3. PUT body → returns {id: ...}
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve({ id: 'yt-video-xyz' }),
    } as unknown as Response)

    const publisher = new YouTubePublisher({
      accessToken: 'tok',
      refreshToken: 'refresh',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })
    const result = await publisher.publish({ text: 'Hello YouTube', imageUrl: 'https://example.com/video.mp4' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.platformPostId).toBe('yt-video-xyz')
    expect(result.url).toBe('https://www.youtube.com/watch?v=yt-video-xyz')
  })

  it('missing credentials: createPublisher throws', () => {
    expect(() => createPublisher('youtube', {})).toThrow('youtube credentials must include')
  })

  it('fetchMetrics returns normalized stats from the Data API', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ items: [{ statistics: { viewCount: '1500', likeCount: '42', commentCount: '7' } }] })
    )
    const publisher = new YouTubePublisher({ accessToken: 'tok', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    const m = await publisher.fetchMetrics('vid123')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/youtube/v3/videos')
    expect(url).toContain('part=statistics')
    expect(url).toContain('id=vid123')
    expect(m).toEqual({ views: 1500, likes: 42, comments: 7 })
  })

  it('fetchMetrics returns null when the video has no statistics', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ items: [] }))
    const publisher = new YouTubePublisher({ accessToken: 'tok', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    expect(await publisher.fetchMetrics('missing')).toBeNull()
  })
})

describe('LinkedInPublisher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy path: text-only post, X-RestLi-Id header returns postId', async () => {
    const mockHeaders = new Map<string, string>([
      ['X-RestLi-Id', 'urn:li:ugcPost:123456'],
    ])
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: (key: string) => mockHeaders.get(key) ?? null },
      json: () => Promise.resolve({}),
    } as unknown as Response)

    const publisher = new LinkedInPublisher({ accessToken: 'tok', ownerUrn: 'urn:li:person:ABC123' })
    const result = await publisher.publish({ text: 'Hello LinkedIn' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]]
    expect(url).toContain('/ugcPosts')
    expect(result.platformPostId).toBe('urn:li:ugcPost:123456')
  })

  it('missing credentials: createPublisher throws', () => {
    expect(() => createPublisher('linkedin', {})).toThrow('linkedin credentials must include')
  })
})
