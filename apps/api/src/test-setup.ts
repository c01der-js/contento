import { vi } from 'vitest'

// Deterministic test env. The server-building suites (health/company-portrait/campaigns)
// construct the Fastify app, whose auth route throws if JWT_SECRET is unset. Set it here so
// tests don't depend on cross-file env leakage (auth.test.ts sets it in its own beforeAll,
// which made the suite order-dependent and flaky). `??=` preserves any real value in CI.
process.env.JWT_SECRET ??= 'test-jwt-secret'

vi.mock('@contento/ai', () => ({
  analyzeTrend: vi.fn().mockResolvedValue({ score: 80, summary: '', angles: [], risks: [] }),
  generateIdeas: vi.fn().mockResolvedValue([]),
  writeScript: vi.fn().mockResolvedValue({ hook: '', body: '', cta: '', caption: '', hashtags: [] }),
  checkBrand: vi.fn().mockResolvedValue({ score: 80, passed: true, issues: [], suggestions: [], summary: '' }),
  analyzeCompany: vi.fn().mockResolvedValue({ niche: '', description: '', usp: '', targetAudience: '', competitors: [], contentAngles: [] }),
  generateContentPlan: vi.fn().mockResolvedValue([]),
  generateCharacterPortrait: vi.fn().mockResolvedValue('mock-job-id'),
  pollJobUntilDone: vi.fn().mockResolvedValue('https://example.com/mock.png'),
  isMockMode: vi.fn().mockReturnValue(true),
  MOCK_IMAGE_URL: 'https://placehold.co/1024x1024/png',
}))
