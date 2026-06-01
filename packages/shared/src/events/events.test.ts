import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { TrendDiscoveredSchema } from './trends.js'
import {
  IdeaRequestedSchema,
  ScriptRequestedSchema,
  RenderRequestedSchema,
} from './content.js'
import {
  PublishRequestedSchema,
  PublishCompletedSchema,
  PublishFailedSchema,
} from './publish.js'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_CUID = 'clh1234567890abcdefghijklm'
const VALID_CUID2 = 'clh1234567890abcdefghijkln'
const VALID_CUID3 = 'clh1234567890abcdefghijklo'
const VALID_TIMESTAMP = '2026-05-06T12:00:00.000Z'

describe('TrendDiscoveredSchema', () => {
  const validTrendDiscovered = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    trendId: VALID_CUID2,
    title: 'AI-generated content trends',
    source: 'manual' as const,
  }

  it('parses valid TrendDiscovered data', () => {
    const result = TrendDiscoveredSchema.parse(validTrendDiscovered)
    expect(result.workspaceId).toBe(validTrendDiscovered.workspaceId)
    expect(result.title).toBe(validTrendDiscovered.title)
    expect(result.source).toBe('manual')
    expect(result.eventId).toBe(VALID_UUID)
  })

  it('parses valid TrendDiscovered with optional fields', () => {
    const result = TrendDiscoveredSchema.parse({
      ...validTrendDiscovered,
      url: 'https://example.com/trend',
      relevanceScore: 0.85,
    })
    expect(result.url).toBe('https://example.com/trend')
    expect(result.relevanceScore).toBe(0.85)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing eventId, trendId, title, source
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid source enum', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        source: 'invalid_source',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for relevanceScore out of range', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        relevanceScore: 1.5,
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for relevanceScore NaN', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        relevanceScore: NaN,
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid workspaceId (not a cuid)', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        workspaceId: 'not-a-cuid',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validTrendDiscovered
    expect(() => TrendDiscoveredSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for invalid eventId (not a UUID)', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        eventId: 'not-a-uuid',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for timestamp with offset', () => {
    expect(() =>
      TrendDiscoveredSchema.parse({
        ...validTrendDiscovered,
        timestamp: '2026-05-06T12:00:00.000+02:00',
      }),
    ).toThrow(ZodError)
  })
})

describe('IdeaRequestedSchema', () => {
  const validIdeaRequested = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    trendId: VALID_CUID2,
    requestedBy: VALID_CUID3,
  }

  it('parses valid IdeaRequested data', () => {
    const result = IdeaRequestedSchema.parse(validIdeaRequested)
    expect(result.eventId).toBe(VALID_UUID)
    expect(result.workspaceId).toBe(VALID_CUID)
    expect(result.trendId).toBe(VALID_CUID2)
    expect(result.requestedBy).toBe(VALID_CUID3)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validIdeaRequested
    expect(() => IdeaRequestedSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      IdeaRequestedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing trendId, requestedBy
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid timestamp with offset', () => {
    expect(() =>
      IdeaRequestedSchema.parse({
        ...validIdeaRequested,
        timestamp: '2026-05-06T12:00:00.000+05:00',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for non-UUID eventId', () => {
    expect(() =>
      IdeaRequestedSchema.parse({
        ...validIdeaRequested,
        eventId: 'not-a-uuid',
      }),
    ).toThrow(ZodError)
  })
})

describe('ScriptRequestedSchema', () => {
  const validScriptRequested = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    ideaId: VALID_CUID2,
    format: 'short_video' as const,
    platform: 'instagram' as const,
    requestedBy: VALID_CUID3,
  }

  it('parses valid ScriptRequested data', () => {
    const result = ScriptRequestedSchema.parse(validScriptRequested)
    expect(result.eventId).toBe(VALID_UUID)
    expect(result.format).toBe('short_video')
    expect(result.platform).toBe('instagram')
  })

  it('throws ZodError for invalid format', () => {
    expect(() =>
      ScriptRequestedSchema.parse({
        ...validScriptRequested,
        format: 'podcast',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid platform', () => {
    expect(() =>
      ScriptRequestedSchema.parse({
        ...validScriptRequested,
        platform: 'facebook',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validScriptRequested
    expect(() => ScriptRequestedSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      ScriptRequestedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing ideaId, format, platform, requestedBy
      }),
    ).toThrow(ZodError)
  })
})

describe('RenderRequestedSchema', () => {
  const validRenderRequested = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    scriptId: VALID_CUID2,
    templateId: 'tmpl-001',
    platform: 'tiktok' as const,
  }

  it('parses valid RenderRequested data', () => {
    const result = RenderRequestedSchema.parse(validRenderRequested)
    expect(result.eventId).toBe(VALID_UUID)
    expect(result.templateId).toBe('tmpl-001')
    expect(result.platform).toBe('tiktok')
  })

  it('throws ZodError for empty templateId', () => {
    expect(() =>
      RenderRequestedSchema.parse({
        ...validRenderRequested,
        templateId: '',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for invalid platform', () => {
    expect(() =>
      RenderRequestedSchema.parse({
        ...validRenderRequested,
        platform: 'snapchat',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validRenderRequested
    expect(() => RenderRequestedSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      RenderRequestedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing scriptId, templateId, platform
      }),
    ).toThrow(ZodError)
  })
})

describe('PublishRequestedSchema', () => {
  const validPublishRequested = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    publicationId: VALID_CUID3,
    platform: 'telegram' as const,
  }

  it('parses valid PublishRequested data', () => {
    const result = PublishRequestedSchema.parse(validPublishRequested)
    expect(result.publicationId).toBe(VALID_CUID3)
    expect(result.platform).toBe('telegram')
    expect(result.eventId).toBe(VALID_UUID)
  })

  it('parses valid PublishRequested with scheduledAt', () => {
    const result = PublishRequestedSchema.parse({
      ...validPublishRequested,
      scheduledAt: '2026-05-07T10:00:00.000Z',
    })
    expect(result.scheduledAt).toBe('2026-05-07T10:00:00.000Z')
  })

  it('throws ZodError for invalid platform', () => {
    expect(() =>
      PublishRequestedSchema.parse({
        ...validPublishRequested,
        platform: 'facebook',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing publicationId', () => {
    expect(() =>
      PublishRequestedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        platform: 'telegram',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validPublishRequested
    expect(() => PublishRequestedSchema.parse(withoutEventId)).toThrow(ZodError)
  })
})

describe('PublishCompletedSchema', () => {
  const validPublishCompleted = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    publicationId: VALID_CUID3,
    platform: 'youtube' as const,
    externalId: 'yt-video-12345',
    publishedAt: VALID_TIMESTAMP,
  }

  it('parses valid PublishCompleted data', () => {
    const result = PublishCompletedSchema.parse(validPublishCompleted)
    expect(result.eventId).toBe(VALID_UUID)
    expect(result.externalId).toBe('yt-video-12345')
    expect(result.platform).toBe('youtube')
  })

  it('parses valid PublishCompleted with optional url', () => {
    const result = PublishCompletedSchema.parse({
      ...validPublishCompleted,
      url: 'https://youtube.com/watch?v=12345',
    })
    expect(result.url).toBe('https://youtube.com/watch?v=12345')
  })

  it('throws ZodError for empty externalId', () => {
    expect(() =>
      PublishCompletedSchema.parse({
        ...validPublishCompleted,
        externalId: '',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validPublishCompleted
    expect(() => PublishCompletedSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for invalid platform', () => {
    expect(() =>
      PublishCompletedSchema.parse({
        ...validPublishCompleted,
        platform: 'twitter',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      PublishCompletedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing publicationId, platform, externalId, publishedAt
      }),
    ).toThrow(ZodError)
  })
})

describe('PublishFailedSchema', () => {
  const validPublishFailed = {
    eventId: VALID_UUID,
    workspaceId: VALID_CUID,
    timestamp: VALID_TIMESTAMP,
    publicationId: VALID_CUID3,
    platform: 'linkedin' as const,
    error: 'Rate limit exceeded',
    retryable: true,
  }

  it('parses valid PublishFailed data', () => {
    const result = PublishFailedSchema.parse(validPublishFailed)
    expect(result.eventId).toBe(VALID_UUID)
    expect(result.error).toBe('Rate limit exceeded')
    expect(result.retryable).toBe(true)
  })

  it('parses valid PublishFailed with retryable false', () => {
    const result = PublishFailedSchema.parse({
      ...validPublishFailed,
      retryable: false,
    })
    expect(result.retryable).toBe(false)
  })

  it('throws ZodError for missing eventId', () => {
    const { eventId: _, ...withoutEventId } = validPublishFailed
    expect(() => PublishFailedSchema.parse(withoutEventId)).toThrow(ZodError)
  })

  it('throws ZodError for invalid platform', () => {
    expect(() =>
      PublishFailedSchema.parse({
        ...validPublishFailed,
        platform: 'whatsapp',
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for missing required fields', () => {
    expect(() =>
      PublishFailedSchema.parse({
        eventId: VALID_UUID,
        workspaceId: VALID_CUID,
        timestamp: VALID_TIMESTAMP,
        // missing publicationId, platform, error, retryable
      }),
    ).toThrow(ZodError)
  })

  it('throws ZodError for non-boolean retryable', () => {
    expect(() =>
      PublishFailedSchema.parse({
        ...validPublishFailed,
        retryable: 'yes',
      }),
    ).toThrow(ZodError)
  })
})
