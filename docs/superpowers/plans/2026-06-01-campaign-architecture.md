# Campaign Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать Campaign-архитектуру: Workspace → CompanyPortrait + AvatarPersona → Campaign → ContentPlan → ContentPlanItem → Script + VideoJob → Publication.

**Architecture:** Новые модели в Prisma, 3 новых API-маршрута, 2 AI-агента, 1 BullMQ-воркер внутри API-процесса, 5 новых страниц Next.js. Существующие модели Script/VideoJob/Publication не изменяются — ContentPlanItem ссылается на них.

**Tech Stack:** Prisma 6, Fastify 5 + fastify-type-provider-zod, BullMQ 5, ioredis, Claude claude-sonnet-4-6, Higgsfield API, Next.js 15 App Router, Vitest

---

## File Map

**Modified:**
- `packages/db/prisma/schema.prisma` — 5 новых моделей + back-relations
- `packages/ai/src/agents/index.ts` — экспорт 2 новых агентов
- `packages/ai/src/index.ts` — уже реэкспортирует agents/index
- `packages/ai/src/higgsfield/client.ts` — добавить `generateCharacterPortrait()`
- `packages/ai/src/higgsfield/index.ts` — экспорт новой функции
- `apps/api/src/server.ts` — регистрация 3 новых маршрутов + campaign-producer
- `apps/api/src/queue.ts` — добавить `getCampaignProducerQueue()`
- `apps/api/src/test-setup.ts` — мокировать новые агенты
- `apps/web/src/components/nav-links.tsx` — добавить Studio в меню

**Created:**
- `packages/ai/src/agents/company-portrait-analyzer.ts`
- `packages/ai/src/agents/content-plan-generator.ts`
- `apps/api/src/routes/company-portrait.ts`
- `apps/api/src/routes/avatar-persona.ts`
- `apps/api/src/routes/campaigns.ts`
- `apps/api/src/jobs/campaign-producer.ts`
- `apps/api/src/routes/company-portrait.test.ts`
- `apps/api/src/routes/campaigns.test.ts`
- `apps/web/src/app/[locale]/(app)/studio/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/onboarding/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/campaigns/new/page.tsx`
- `apps/web/src/app/[locale]/(app)/studio/campaigns/[id]/page.tsx`
- `apps/web/src/app/[locale]/(app)/review/campaigns/[id]/page.tsx`

---

## Task 1: Prisma Schema — новые модели

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Добавить enum'ы после существующих enum'ов (после `CommentEntityType`)**

```prisma
enum AvatarPersonaStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  COMPLETED
  PAUSED
}

enum ContentPlanStatus {
  DRAFT
  APPROVED
  IN_PRODUCTION
  COMPLETED
}

enum ContentPlanItemStatus {
  PENDING
  SCRIPTING
  SCRIPTED
  VIDEO_QUEUED
  VIDEO_GENERATING
  VIDEO_DONE
  CLIENT_REVIEW
  APPROVED
  PUBLISHED
  REJECTED
}
```

- [ ] **Step 2: Добавить новые модели в конец файла**

```prisma
model CompanyPortrait {
  id             String    @id @default(cuid())
  workspaceId    String    @unique
  niche          String
  description    String
  usp            String
  targetAudience String
  competitors    String[]
  contentAngles  String[]
  rawInput       Json      @default("{}")
  generatedAt    DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  workspace      Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model AvatarPersona {
  id                String              @id @default(cuid())
  workspaceId       String              @unique
  description       String
  style             String
  gender            String
  referenceImageUrl String?
  higgsfieldSoulId  String?
  status            AvatarPersonaStatus @default(PENDING)
  errorMessage      String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  workspace         Workspace           @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model Campaign {
  id           String         @id @default(cuid())
  workspaceId  String
  name         String
  goal         GoalType
  targetAction String
  startsAt     DateTime
  endsAt       DateTime
  status       CampaignStatus @default(DRAFT)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  workspace    Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contentPlan  ContentPlan?

  @@index([workspaceId])
  @@index([workspaceId, status])
}

model ContentPlan {
  id         String            @id @default(cuid())
  campaignId String            @unique
  status     ContentPlanStatus @default(DRAFT)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
  campaign   Campaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  items      ContentPlanItem[]
}

model ContentPlanItem {
  id            String                @id @default(cuid())
  contentPlanId String
  index         Int
  topic         String
  format        String
  scheduledDate DateTime
  hook          String
  status        ContentPlanItemStatus @default(PENDING)
  rejectComment String?
  scriptId      String?
  videoJobId    String?
  publicationId String?
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  contentPlan   ContentPlan           @relation(fields: [contentPlanId], references: [id], onDelete: Cascade)
  script        Script?               @relation(fields: [scriptId], references: [id], onDelete: SetNull)
  videoJob      VideoJob?             @relation(fields: [videoJobId], references: [id], onDelete: SetNull)
  publication   Publication?          @relation(fields: [publicationId], references: [id], onDelete: SetNull)

  @@index([contentPlanId])
  @@index([contentPlanId, status])
}
```

- [ ] **Step 3: Добавить back-relations к существующим моделям**

В модели `Workspace` добавить после последнего поля-связи (найти `snapshots` или `videoJobs`):
```prisma
  campaigns       Campaign[]
  companyPortrait CompanyPortrait?
  avatarPersona   AvatarPersona?
```

В модели `Script` добавить:
```prisma
  contentPlanItems ContentPlanItem[]
```

В модели `VideoJob` добавить:
```prisma
  contentPlanItems ContentPlanItem[]
```

В модели `Publication` добавить:
```prisma
  contentPlanItems ContentPlanItem[]
```

- [ ] **Step 4: Применить схему**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
DATABASE_URL=postgresql://contento:contento@localhost:5432/contento \
  pnpm --filter @contento/db run db:push
```

Ожидаемый вывод: `The database is already in sync with the Prisma schema.` или `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Пересобрать DB-пакет**

```bash
DATABASE_URL=postgresql://contento:contento@localhost:5432/contento \
  pnpm --filter @contento/db run db:generate-and-build
```

Ожидаемый вывод: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Campaign architecture models (CompanyPortrait, AvatarPersona, Campaign, ContentPlan, ContentPlanItem)"
```

---

## Task 2: Higgsfield — generateCharacterPortrait

**Files:**
- Modify: `packages/ai/src/higgsfield/client.ts`
- Modify: `packages/ai/src/higgsfield/index.ts`

- [ ] **Step 1: Добавить функцию в `packages/ai/src/higgsfield/client.ts`** (после `submitImageToVideo`):

```typescript
/**
 * Generate a character portrait image from a text description.
 * Uses Higgsfield foundation text2image (no Soul required).
 * Returns a jobSetId to poll with pollJobUntilDone().
 */
export async function generateCharacterPortrait(
  description: string,
  style: string,
  gender: string,
): Promise<string> {
  const prompt = `Portrait photo of a ${gender} ${style} professional brand ambassador. ${description}. Clean background, high quality, photorealistic, suitable for video avatar.`
  return hfGenerate('/v1/text2image/foundation', {
    prompt,
    width_and_height: '1024x1024',
    quality: '1080p',
    batch_size: 1,
  })
}
```

- [ ] **Step 2: Экспортировать из `packages/ai/src/higgsfield/index.ts`**

Добавить в файл:
```typescript
export { generateCharacterPortrait } from './client.js'
```

- [ ] **Step 3: Пересобрать AI-пакет**

```bash
pnpm --filter @contento/ai build
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/higgsfield/
git commit -m "feat(ai): add generateCharacterPortrait for brand avatar generation"
```

---

## Task 3: AI Agent — company-portrait-analyzer

**Files:**
- Create: `packages/ai/src/agents/company-portrait-analyzer.ts`
- Modify: `packages/ai/src/agents/index.ts`

- [ ] **Step 1: Создать `packages/ai/src/agents/company-portrait-analyzer.ts`**

```typescript
import { runAnthropicMessage } from '../client.js'

export interface CompanyInput {
  companyName: string
  niche: string
  website?: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
}

export interface CompanyPortraitResult {
  niche: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
  contentAngles: string[]
}

export async function analyzeCompany(
  workspaceId: string,
  input: CompanyInput,
): Promise<CompanyPortraitResult> {
  const response = await runAnthropicMessage(
    { agent: 'company-portrait-analyzer', workspaceId },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: `You are a brand strategist. Analyze the company data and generate a structured brand portrait.
Return ONLY valid JSON with this exact shape:
{
  "niche": "one-line niche description",
  "description": "2-3 sentence brand overview",
  "usp": "unique selling proposition in one sentence",
  "targetAudience": "detailed target audience description",
  "competitors": ["competitor1", "competitor2"],
  "contentAngles": ["angle1", "angle2", "angle3", "angle4", "angle5"]
}

contentAngles are 5-7 unique content perspectives for this brand — specific topics/angles the brand can authentically speak about to engage their audience. Make them specific, not generic.`,
        },
      ],
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as CompanyPortraitResult
  } catch {
    throw new Error('company-portrait-analyzer returned invalid JSON: ' + text.slice(0, 120))
  }
}
```

- [ ] **Step 2: Экспортировать из `packages/ai/src/agents/index.ts`**

Добавить в конец файла:
```typescript
export { analyzeCompany } from './company-portrait-analyzer.js'
export type { CompanyInput, CompanyPortraitResult } from './company-portrait-analyzer.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/agents/company-portrait-analyzer.ts packages/ai/src/agents/index.ts
git commit -m "feat(ai): add company-portrait-analyzer agent"
```

---

## Task 4: AI Agent — content-plan-generator

**Files:**
- Create: `packages/ai/src/agents/content-plan-generator.ts`
- Modify: `packages/ai/src/agents/index.ts`

- [ ] **Step 1: Создать `packages/ai/src/agents/content-plan-generator.ts`**

```typescript
import { runAnthropicMessage } from '../client.js'
import type { CompanyPortraitResult } from './company-portrait-analyzer.js'

export interface ContentPlanRequest {
  portrait: CompanyPortraitResult
  goal: 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'
  targetAction: string
  startsAt: string
  endsAt: string
  virloTrends?: Array<{ title: string; views?: number; platform?: string }>
}

export interface ContentPlanItemDraft {
  index: number
  topic: string
  format: string
  scheduledDate: string
  hook: string
}

const GOAL_LABELS: Record<string, string> = {
  SUBSCRIBERS: 'grow subscribers/followers',
  SALES: 'drive sales and conversions',
  ENGAGEMENT: 'maximize engagement (likes, comments, shares)',
  REACH: 'maximize reach and brand awareness',
}

const HOOK_FORMULAS = `
Proven hook formulas to choose from:
- Pattern Interrupt: "Stop scrolling if you [relatable situation]"
- Bold Claim: "[Surprising statistic or counterintuitive statement]"
- Question Hook: "Did you know that [unexpected fact about niche]?"
- Story Hook: "I [made mistake / discovered secret] and here's what happened"
- Curiosity Gap: "The one thing [target audience] never does — but should"
- Direct CTA: "Watch this before you [common mistake in niche]"
`

export async function generateContentPlan(
  workspaceId: string,
  request: ContentPlanRequest,
): Promise<ContentPlanItemDraft[]> {
  const start = new Date(request.startsAt)
  const end = new Date(request.endsAt)
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const videoCount = Math.min(Math.max(Math.floor(days / 3), 3), 20)

  const trendsSection = request.virloTrends?.length
    ? `\nTrending videos in this niche:\n${request.virloTrends.slice(0, 10).map(t => `- "${t.title}"${t.views ? ` (${t.views} views)` : ''}`).join('\n')}`
    : ''

  const response = await runAnthropicMessage(
    { agent: 'content-plan-generator', workspaceId },
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: `You are a social media content strategist. Generate a video content plan.
${HOOK_FORMULAS}
Return ONLY valid JSON array with exactly ${videoCount} items. Each item:
{
  "index": 0,
  "topic": "specific video topic",
  "format": "reel",
  "scheduledDate": "YYYY-MM-DD",
  "hook": "exact opening hook text (max 15 words, from the proven formulas above)"
}

Distribute scheduledDates evenly between ${request.startsAt.slice(0, 10)} and ${request.endsAt.slice(0, 10)}.
All hooks must drive the goal: ${GOAL_LABELS[request.goal]}.
CTA direction for all videos: "${request.targetAction}".`,
        },
      ],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            brand: {
              niche: request.portrait.niche,
              usp: request.portrait.usp,
              targetAudience: request.portrait.targetAudience,
              contentAngles: request.portrait.contentAngles,
            },
            goal: request.goal,
            targetAction: request.targetAction,
            trendsSection,
          }),
        },
      ],
    },
  )

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const items = JSON.parse(text) as ContentPlanItemDraft[]
    return items.map((item, i) => ({ ...item, index: i }))
  } catch {
    throw new Error('content-plan-generator returned invalid JSON: ' + text.slice(0, 120))
  }
}
```

- [ ] **Step 2: Добавить экспорт в `packages/ai/src/agents/index.ts`**

```typescript
export { generateContentPlan } from './content-plan-generator.js'
export type { ContentPlanRequest, ContentPlanItemDraft } from './content-plan-generator.js'
```

- [ ] **Step 3: Пересобрать AI-пакет**

```bash
pnpm --filter @contento/ai build
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/agents/content-plan-generator.ts packages/ai/src/agents/index.ts
git commit -m "feat(ai): add content-plan-generator agent with proven hook formulas"
```

---

## Task 5: API Route — company-portrait

**Files:**
- Create: `apps/api/src/routes/company-portrait.ts`
- Create: `apps/api/src/routes/company-portrait.test.ts`

- [ ] **Step 1: Написать тест `apps/api/src/routes/company-portrait.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer } from '../server.js'
import type { FastifyInstance } from 'fastify'

vi.mock('@contento/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contento/ai')>()
  return {
    ...actual,
    analyzeCompany: vi.fn().mockResolvedValue({
      niche: 'SaaS tools',
      description: 'Test company',
      usp: 'Best product',
      targetAudience: 'Developers',
      competitors: ['Competitor A'],
      contentAngles: ['Angle 1', 'Angle 2'],
    }),
  }
})

vi.mock('../middleware/rbac.js', () => ({
  requireRole: () => async () => {},
  requireMinRole: () => async () => {},
  requireWriteRole: async () => {},
  requireReadRole: async () => {},
  requireApprovalRole: async () => {},
}))

vi.mock('@contento/db', () => ({
  prisma: {
    membership: {
      findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }),
    },
    companyPortrait: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({
        id: 'cp1',
        workspaceId: 'ws1',
        niche: 'SaaS tools',
        description: 'Test company',
        usp: 'Best product',
        targetAudience: 'Developers',
        competitors: ['Competitor A'],
        contentAngles: ['Angle 1', 'Angle 2'],
        rawInput: {},
        generatedAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  },
}))

describe('Company Portrait API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createServer()
    await app.ready()
  })

  afterAll(async () => { await app.close() })

  it('POST /workspaces/ws1/company-portrait/generate returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/workspaces/ws1/company-portrait/generate',
      headers: { authorization: 'Bearer test' },
      payload: {
        companyName: 'TestCo',
        niche: 'SaaS',
        description: 'We make tools',
        usp: 'Best UX',
        targetAudience: 'SMBs',
        competitors: [],
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ niche: 'SaaS tools' })
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm --filter @contento/api exec vitest run src/routes/company-portrait.test.ts
```

Ожидаемый вывод: FAIL (маршрут не существует)

- [ ] **Step 3: Создать `apps/api/src/routes/company-portrait.ts`**

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { analyzeCompany } from '@contento/ai'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const CompanyPortraitResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  niche: z.string(),
  description: z.string(),
  usp: z.string(),
  targetAudience: z.string(),
  competitors: z.array(z.string()),
  contentAngles: z.array(z.string()),
  generatedAt: z.string(),
  updatedAt: z.string(),
})

const GenerateBody = z.object({
  companyName: z.string().min(1),
  niche: z.string().min(1),
  website: z.string().url().optional(),
  description: z.string().min(1),
  usp: z.string().min(1),
  targetAudience: z.string().min(1),
  competitors: z.array(z.string()).optional().default([]),
})

function serialize(p: {
  id: string; workspaceId: string; niche: string; description: string
  usp: string; targetAudience: string; competitors: string[]; contentAngles: string[]
  generatedAt: Date; updatedAt: Date
}) {
  return { ...p, generatedAt: p.generatedAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export const companyPortraitRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /company-portrait
  app.get('/company-portrait', {
    schema: {
      params: WorkspaceParams,
      response: { 200: CompanyPortraitResponse.nullable(), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const portrait = await prisma.companyPortrait.findUnique({ where: { workspaceId } })
    return reply.send(portrait ? serialize(portrait) : null)
  })

  // POST /company-portrait/generate
  app.post('/company-portrait/generate', {
    schema: {
      params: WorkspaceParams,
      body: GenerateBody,
      response: { 200: CompanyPortraitResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const input = request.body

    const result = await analyzeCompany(workspaceId, {
      companyName: input.companyName,
      niche: input.niche,
      website: input.website,
      description: input.description,
      usp: input.usp,
      targetAudience: input.targetAudience,
      competitors: input.competitors,
    })

    const portrait = await prisma.companyPortrait.upsert({
      where: { workspaceId },
      update: { ...result, rawInput: input as object, generatedAt: new Date() },
      create: { workspaceId, ...result, rawInput: input as object },
    })

    return reply.send(serialize(portrait))
  })
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm --filter @contento/api exec vitest run src/routes/company-portrait.test.ts
```

Ожидаемый вывод: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/company-portrait.ts apps/api/src/routes/company-portrait.test.ts
git commit -m "feat(api): add company-portrait route with AI generation"
```

---

## Task 6: API Route — avatar-persona

**Files:**
- Create: `apps/api/src/routes/avatar-persona.ts`

- [ ] **Step 1: Создать `apps/api/src/routes/avatar-persona.ts`**

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { generateCharacterPortrait, pollJobUntilDone, isMockMode, MOCK_IMAGE_URL } from '@contento/ai'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const AvatarPersonaResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  description: z.string(),
  style: z.string(),
  gender: z.string(),
  referenceImageUrl: z.string().nullable(),
  higgsfieldSoulId: z.string().nullable(),
  status: z.enum(['PENDING', 'GENERATING', 'READY', 'FAILED']),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const UpsertBody = z.object({
  description: z.string().min(1),
  style: z.enum(['professional', 'casual', 'energetic', 'authoritative', 'friendly']),
  gender: z.enum(['male', 'female', 'neutral']),
  higgsfieldSoulId: z.string().optional(),
})

function serialize(p: {
  id: string; workspaceId: string; description: string; style: string; gender: string
  referenceImageUrl: string | null; higgsfieldSoulId: string | null
  status: string; errorMessage: string | null; createdAt: Date; updatedAt: Date
}) {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export const avatarPersonaRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /avatar-persona
  app.get('/avatar-persona', {
    schema: {
      params: WorkspaceParams,
      response: { 200: AvatarPersonaResponse.nullable(), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const persona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
    return reply.send(persona ? serialize(persona) : null)
  })

  // POST /avatar-persona — upsert description/style/gender
  app.post('/avatar-persona', {
    schema: {
      params: WorkspaceParams,
      body: UpsertBody,
      response: { 200: AvatarPersonaResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { description, style, gender, higgsfieldSoulId } = request.body

    const persona = await prisma.avatarPersona.upsert({
      where: { workspaceId },
      update: { description, style, gender, ...(higgsfieldSoulId ? { higgsfieldSoulId } : {}), status: 'PENDING' },
      create: { workspaceId, description, style, gender, higgsfieldSoulId: higgsfieldSoulId ?? null, status: 'PENDING' },
    })

    return reply.send(serialize(persona))
  })

  // POST /avatar-persona/generate-image — trigger Higgsfield portrait generation
  app.post('/avatar-persona/generate-image', {
    schema: {
      params: WorkspaceParams,
      response: { 202: AvatarPersonaResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const persona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
    if (!persona) return reply.status(404).send({ error: 'Avatar persona not set. Call POST /avatar-persona first.' })

    // Mark as GENERATING and respond immediately — generation runs in background
    const updated = await prisma.avatarPersona.update({
      where: { workspaceId },
      data: { status: 'GENERATING', errorMessage: null },
    })

    // Fire-and-forget background generation
    ;(async () => {
      try {
        let imageUrl: string
        if (isMockMode()) {
          imageUrl = MOCK_IMAGE_URL
        } else {
          const jobSetId = await generateCharacterPortrait(persona.description, persona.style, persona.gender)
          imageUrl = await pollJobUntilDone(jobSetId)
        }
        await prisma.avatarPersona.update({
          where: { workspaceId },
          data: { referenceImageUrl: imageUrl, status: 'READY' },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.avatarPersona.update({
          where: { workspaceId },
          data: { status: 'FAILED', errorMessage: msg },
        })
      }
    })()

    return reply.status(202).send(serialize(updated))
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/avatar-persona.ts
git commit -m "feat(api): add avatar-persona route with async Higgsfield portrait generation"
```

---

## Task 7: API Route — campaigns (CRUD + plan generation)

**Files:**
- Create: `apps/api/src/routes/campaigns.ts`
- Create: `apps/api/src/routes/campaigns.test.ts`

- [ ] **Step 1: Написать тест `apps/api/src/routes/campaigns.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer } from '../server.js'
import type { FastifyInstance } from 'fastify'

vi.mock('@contento/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contento/ai')>()
  return {
    ...actual,
    generateContentPlan: vi.fn().mockResolvedValue([
      { index: 0, topic: 'Intro video', format: 'reel', scheduledDate: '2026-07-01', hook: 'Stop scrolling if you use spreadsheets' },
      { index: 1, topic: 'Tips video', format: 'reel', scheduledDate: '2026-07-04', hook: 'Did you know 80% of teams waste time here?' },
    ]),
  }
})

vi.mock('../middleware/rbac.js', () => ({
  requireRole: () => async () => {},
  requireMinRole: () => async () => {},
  requireWriteRole: async () => {},
  requireReadRole: async () => {},
  requireApprovalRole: async () => {},
}))

const mockCampaign = {
  id: 'camp1',
  workspaceId: 'ws1',
  name: 'Summer Campaign',
  goal: 'SALES' as const,
  targetAction: 'Book a call',
  startsAt: new Date('2026-07-01'),
  endsAt: new Date('2026-07-31'),
  status: 'DRAFT' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  contentPlan: null,
}

vi.mock('@contento/db', () => ({
  prisma: {
    membership: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    companyPortrait: {
      findUnique: vi.fn().mockResolvedValue({
        niche: 'SaaS', description: 'Test', usp: 'Best', targetAudience: 'Devs',
        competitors: [], contentAngles: ['Angle 1'],
      }),
    },
    campaign: {
      findMany: vi.fn().mockResolvedValue([mockCampaign]),
      findFirst: vi.fn().mockResolvedValue(mockCampaign),
      create: vi.fn().mockResolvedValue(mockCampaign),
    },
    contentPlan: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'cp1', campaignId: 'camp1', status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), items: [] }),
      update: vi.fn().mockResolvedValue({}),
    },
    contentPlanItem: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trendFeedConfig: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

describe('Campaigns API', () => {
  let app: FastifyInstance

  beforeAll(async () => { app = await createServer(); await app.ready() })
  afterAll(async () => { await app.close() })

  it('GET /workspaces/ws1/campaigns returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/workspaces/ws1/campaigns', headers: { authorization: 'Bearer test' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ items: expect.any(Array) })
  })

  it('POST /workspaces/ws1/campaigns creates campaign', async () => {
    const res = await app.inject({
      method: 'POST', url: '/workspaces/ws1/campaigns',
      headers: { authorization: 'Bearer test' },
      payload: { name: 'Summer Campaign', goal: 'SALES', targetAction: 'Book a call', startsAt: '2026-07-01', endsAt: '2026-07-31' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /workspaces/ws1/campaigns/camp1/content-plan/generate returns 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/workspaces/ws1/campaigns/camp1/content-plan/generate',
      headers: { authorization: 'Bearer test' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ items: expect.any(Array) })
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm --filter @contento/api exec vitest run src/routes/campaigns.test.ts
```

- [ ] **Step 3: Создать `apps/api/src/routes/campaigns.ts`**

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole, requireRole } from '../middleware/rbac.js'
import { generateContentPlan } from '@contento/ai'
import { getCampaignProducerQueue } from '../queue.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const CampaignParams = z.object({ workspaceId: z.string(), campaignId: z.string() })
const ItemParams = z.object({ workspaceId: z.string(), campaignId: z.string(), itemId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ContentPlanItemResponse = z.object({
  id: z.string(),
  index: z.number(),
  topic: z.string(),
  format: z.string(),
  scheduledDate: z.string(),
  hook: z.string(),
  status: z.string(),
  rejectComment: z.string().nullable(),
  scriptId: z.string().nullable(),
  videoJobId: z.string().nullable(),
  publicationId: z.string().nullable(),
})

const ContentPlanResponse = z.object({
  id: z.string(),
  status: z.string(),
  items: z.array(ContentPlanItemResponse),
})

const CampaignResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  goal: z.string(),
  targetAction: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentPlan: ContentPlanResponse.nullable(),
})

const CampaignListResponse = z.object({ items: z.array(CampaignResponse) })

const CreateBody = z.object({
  name: z.string().min(1),
  goal: z.enum(['SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH']),
  targetAction: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
})

const RejectBody = z.object({ comment: z.string().min(1) })

function serializeItem(item: {
  id: string; index: number; topic: string; format: string; scheduledDate: Date
  hook: string; status: string; rejectComment: string | null
  scriptId: string | null; videoJobId: string | null; publicationId: string | null
}) {
  return { ...item, scheduledDate: item.scheduledDate.toISOString() }
}

function serializeCampaign(c: {
  id: string; workspaceId: string; name: string; goal: string; targetAction: string
  startsAt: Date; endsAt: Date; status: string; createdAt: Date; updatedAt: Date
  contentPlan: null | { id: string; status: string; items: ReturnType<typeof serializeItem>[] }
}) {
  return {
    ...c,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

export const campaignRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /campaigns
  app.get('/campaigns', {
    schema: { params: WorkspaceParams, response: { 200: CampaignListResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({
      items: campaigns.map(c => serializeCampaign({
        ...c,
        contentPlan: c.contentPlan
          ? { ...c.contentPlan, items: c.contentPlan.items.map(serializeItem) }
          : null,
      })),
    })
  })

  // POST /campaigns
  app.post('/campaigns', {
    schema: { params: WorkspaceParams, body: CreateBody, response: { 201: CampaignResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { name, goal, targetAction, startsAt, endsAt } = request.body
    const campaign = await prisma.campaign.create({
      data: { workspaceId, name, goal, targetAction, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
      include: { contentPlan: { include: { items: true } } },
    })
    return reply.status(201).send(serializeCampaign({ ...campaign, contentPlan: null }))
  })

  // GET /campaigns/:campaignId
  app.get('/campaigns/:campaignId', {
    schema: { params: CampaignParams, response: { 200: CampaignResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' } } } } },
    })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })
    return reply.send(serializeCampaign({
      ...campaign,
      contentPlan: campaign.contentPlan
        ? { ...campaign.contentPlan, items: campaign.contentPlan.items.map(serializeItem) }
        : null,
    }))
  })

  // POST /campaigns/:campaignId/content-plan/generate
  app.post('/campaigns/:campaignId/content-plan/generate', {
    schema: {
      params: CampaignParams,
      response: { 200: ContentPlanResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const portrait = await prisma.companyPortrait.findUnique({ where: { workspaceId } })
    if (!portrait) return reply.status(400).send({ error: 'Company portrait not found. Run onboarding first.' })

    const items = await generateContentPlan(workspaceId, {
      portrait: {
        niche: portrait.niche,
        description: portrait.description,
        usp: portrait.usp,
        targetAudience: portrait.targetAudience,
        competitors: portrait.competitors,
        contentAngles: portrait.contentAngles,
      },
      goal: campaign.goal,
      targetAction: campaign.targetAction,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
    })

    // Delete existing plan if regenerating
    const existing = await prisma.contentPlan.findUnique({ where: { campaignId } })
    if (existing) {
      await prisma.contentPlan.delete({ where: { campaignId } })
    }

    const plan = await prisma.contentPlan.create({
      data: {
        campaignId,
        items: {
          create: items.map(item => ({
            index: item.index,
            topic: item.topic,
            format: item.format,
            scheduledDate: new Date(item.scheduledDate),
            hook: item.hook,
          })),
        },
      },
      include: { items: { orderBy: { index: 'asc' } } },
    })

    return reply.send({ ...plan, items: plan.items.map(serializeItem) })
  })

  // POST /campaigns/:campaignId/approve-plan
  app.post('/campaigns/:campaignId/approve-plan', {
    schema: {
      params: CampaignParams,
      response: { 202: z.object({ message: z.string() }), 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const plan = await prisma.contentPlan.findUnique({ where: { campaignId }, include: { items: true } })
    if (!plan) return reply.status(400).send({ error: 'Generate a content plan first.' })
    if (plan.status !== 'DRAFT') return reply.status(400).send({ error: `Plan is already ${plan.status}` })

    await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'APPROVED' } })
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } })

    const queue = getCampaignProducerQueue()
    await queue.add('produce', { campaignId, workspaceId })

    return reply.status(202).send({ message: 'Content plan approved. Video production started.' })
  })

  // PUT /campaigns/:campaignId/items/:itemId/approve — CLIENT approves video
  app.put('/campaigns/:campaignId/items/:itemId/approve', {
    schema: {
      params: ItemParams,
      response: { 200: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('CLIENT', 'APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.status !== 'CLIENT_REVIEW') return reply.status(400).send({ error: `Item status is ${item.status}, expected CLIENT_REVIEW` })

    const updated = await prisma.contentPlanItem.update({
      where: { id: itemId },
      data: { status: 'APPROVED' },
    })

    // Schedule publication if script + socialAccount available
    if (updated.scriptId) {
      const socialAccount = await prisma.socialAccount.findFirst({ where: { workspaceId } })
      if (socialAccount) {
        const pub = await prisma.publication.create({
          data: {
            workspaceId,
            scriptId: updated.scriptId,
            socialAccountId: socialAccount.id,
            scheduledAt: updated.scheduledDate,
            renderJobId: null,
          },
        })
        await prisma.contentPlanItem.update({ where: { id: itemId }, data: { publicationId: pub.id, status: 'PUBLISHED' } })
      }
    }

    return reply.send(serializeItem(updated))
  })

  // PUT /campaigns/:campaignId/items/:itemId/reject — CLIENT rejects video
  app.put('/campaigns/:campaignId/items/:itemId/reject', {
    schema: {
      params: ItemParams,
      body: RejectBody,
      response: { 200: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('CLIENT', 'APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params
    const { comment } = request.body

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.status !== 'CLIENT_REVIEW') return reply.status(400).send({ error: `Item status is ${item.status}` })

    const updated = await prisma.contentPlanItem.update({
      where: { id: itemId },
      data: { status: 'REJECTED', rejectComment: comment },
    })

    return reply.send(serializeItem(updated))
  })
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm --filter @contento/api exec vitest run src/routes/campaigns.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts
git commit -m "feat(api): add campaigns routes (CRUD, content plan generation, approve/reject)"
```

---

## Task 8: BullMQ Job — campaign-producer

**Files:**
- Create: `apps/api/src/jobs/campaign-producer.ts`

- [ ] **Step 1: Создать `apps/api/src/jobs/campaign-producer.ts`**

```typescript
import { Worker } from 'bullmq'
import { prisma } from '@contento/db'
import { writeScript } from '@contento/ai'
import { getVideoQueue } from '../queue.js'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const VIDEO_POLL_INTERVAL_MS = 15_000
const VIDEO_TIMEOUT_MS = 45 * 60 * 1000 // 45 min per video

interface ProducePayload {
  campaignId: string
  workspaceId: string
}

async function pollVideoJob(videoJobId: string, timeoutMs: number): Promise<'DONE' | 'FAILED'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { status: true } })
    if (job?.status === 'DONE') return 'DONE'
    if (job?.status === 'FAILED') return 'FAILED'
    await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL_MS))
  }
  return 'FAILED'
}

async function notifyClients(workspaceId: string, campaignId: string, itemId: string): Promise<void> {
  const clients = await prisma.membership.findMany({
    where: { workspaceId, role: 'CLIENT' },
    select: { userId: true },
  })
  if (clients.length === 0) return
  await prisma.notification.createMany({
    data: clients.map(m => ({
      workspaceId,
      userId: m.userId,
      type: 'APPROVAL_NEEDED' as const,
      title: 'Video ready for review',
      body: `A new video in your campaign is ready for your approval.`,
      entityType: 'ContentPlanItem',
      entityId: itemId,
    })),
  })
}

export function startCampaignProducer(): Worker {
  const worker = new Worker<ProducePayload>(
    'campaign-producer',
    async (job) => {
      const { campaignId, workspaceId } = job.data

      const plan = await prisma.contentPlan.findUnique({
        where: { campaignId },
        include: { items: { orderBy: { index: 'asc' } }, campaign: true },
      })
      if (!plan) throw new Error(`ContentPlan not found for campaign ${campaignId}`)

      await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'IN_PRODUCTION' } })

      const avatarPersona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
      const soulId = avatarPersona?.higgsfieldSoulId ?? process.env['HIGGSFIELD_SOUL_ID'] ?? ''

      for (const item of plan.items) {
        if (item.status !== 'PENDING') continue

        // Step 1: Generate script
        await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'SCRIPTING' } })

        let scriptId: string
        try {
          const contentScript = await writeScript(workspaceId, {
            title: item.topic,
            angle: item.hook,
            format: item.format,
            platform: 'instagram',
          })

          const script = await prisma.script.create({
            data: {
              workspaceId,
              title: item.topic,
              hook: contentScript.hook,
              body: contentScript.body,
              cta: contentScript.cta,
              caption: contentScript.caption,
              hashtags: contentScript.hashtags,
              format: item.format,
              status: 'APPROVED',
            },
          })
          scriptId = script.id
          await prisma.contentPlanItem.update({ where: { id: item.id }, data: { scriptId, status: 'SCRIPTED' } })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'REJECTED', rejectComment: `Script generation failed: ${msg}` } })
          continue
        }

        // Step 2: Enqueue video job
        await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'VIDEO_QUEUED' } })

        const videoJob = await prisma.videoJob.create({
          data: { workspaceId, scriptId, status: 'PENDING', language: 'ru', aspectRatio: '9:16' },
        })

        await getVideoQueue().add('generate', {
          videoJobId: videoJob.id,
          scriptId,
          workspaceId,
          language: 'ru',
          soulId,
        })

        await prisma.contentPlanItem.update({
          where: { id: item.id },
          data: { videoJobId: videoJob.id, status: 'VIDEO_GENERATING' },
        })

        // Step 3: Poll until done
        const result = await pollVideoJob(videoJob.id, VIDEO_TIMEOUT_MS)

        if (result === 'DONE') {
          await prisma.contentPlanItem.update({ where: { id: item.id }, data: { status: 'CLIENT_REVIEW' } })
          await notifyClients(workspaceId, campaignId, item.id)
        } else {
          const failed = await prisma.videoJob.findUnique({ where: { id: videoJob.id }, select: { errorMessage: true } })
          await prisma.contentPlanItem.update({
            where: { id: item.id },
            data: { status: 'REJECTED', rejectComment: `Video generation failed: ${failed?.errorMessage ?? 'timeout'}` },
          })
        }
      }

      // Check if all done
      const remaining = await prisma.contentPlanItem.count({
        where: { contentPlanId: plan.id, status: { in: ['PENDING', 'SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'] } },
      })
      if (remaining === 0) {
        await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'COMPLETED' } })
      }
    },
    { connection: { url: REDIS_URL }, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    console.error(`[campaign-producer] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/jobs/campaign-producer.ts
git commit -m "feat(api): add campaign-producer BullMQ worker (sequential video production)"
```

---

## Task 9: Wire routes + worker into server

**Files:**
- Modify: `apps/api/src/queue.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/test-setup.ts`

- [ ] **Step 1: Добавить queue в `apps/api/src/queue.ts`** (в конец файла):

```typescript
let _campaignProducerConnection: IORedis | null = null
let _campaignProducerQueue: Queue | null = null

export function getCampaignProducerQueue(): Queue {
  if (!_campaignProducerQueue) {
    _campaignProducerConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
    _campaignProducerQueue = new Queue('campaign-producer', { connection: _campaignProducerConnection })
  }
  return _campaignProducerQueue
}
```

- [ ] **Step 2: Добавить импорты и регистрацию маршрутов в `apps/api/src/server.ts`**

Добавить в блок импортов:
```typescript
import { companyPortraitRoutes } from './routes/company-portrait.js'
import { avatarPersonaRoutes } from './routes/avatar-persona.js'
import { campaignRoutes } from './routes/campaigns.js'
import { startCampaignProducer } from './jobs/campaign-producer.js'
```

Добавить регистрацию маршрутов (после `trendFeedConfigRoutes`):
```typescript
  await app.register(companyPortraitRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(avatarPersonaRoutes, { prefix: '/workspaces/:workspaceId' })
  await app.register(campaignRoutes, { prefix: '/workspaces/:workspaceId' })
```

Добавить запуск воркера в `onReady`:
```typescript
    startCampaignProducer()
```

- [ ] **Step 3: Обновить `apps/api/src/test-setup.ts`** — добавить моки новых агентов:

```typescript
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
```

- [ ] **Step 4: Проверить что API поднимается**

```bash
curl -s http://localhost:3001/health
```

Ожидаемый вывод: `{"status":"ok"}`

Если API не запущен:
```bash
cd /Users/ilyaegorov/Downloads/Contento-main
pnpm --filter @contento/api run dev > /tmp/contento-api.log 2>&1 &
sleep 5 && curl -s http://localhost:3001/health
```

- [ ] **Step 5: Проверить новые маршруты доступны через Swagger**

```bash
curl -s http://localhost:3001/docs/json | python3 -c "import sys,json; paths=json.load(sys.stdin)['paths']; print([p for p in paths if 'campaign' in p or 'portrait' in p or 'avatar' in p])"
```

Ожидаемый вывод: список с `/workspaces/{workspaceId}/campaigns`, `/workspaces/{workspaceId}/company-portrait`, `/workspaces/{workspaceId}/avatar-persona`

- [ ] **Step 6: Запустить все тесты**

```bash
pnpm --filter @contento/api exec vitest run
```

Ожидаемый вывод: все тесты PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/queue.ts apps/api/src/server.ts apps/api/src/test-setup.ts
git commit -m "feat(api): wire campaign routes and producer worker into server"
```

---

## Task 10: Web — Studio nav + dashboard

**Files:**
- Modify: `apps/web/src/components/nav-links.tsx`
- Create: `apps/web/src/app/[locale]/(app)/studio/page.tsx`

- [ ] **Step 1: Добавить Studio в `apps/web/src/components/nav-links.tsx`**

Заменить массив `NAV_ITEMS`:
```typescript
const NAV_ITEMS: NavItem[] = [
  { href: '/studio', label: 'Studio', icon: '▶' },
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/trends', label: 'Trends', icon: '↑' },
  { href: '/brand', label: 'Brand Kit', icon: '◈' },
  { href: '/create', label: 'Create', icon: '+' },
  { href: '/review', label: 'Review', icon: '✓' },
  { href: '/calendar', label: 'Calendar', icon: '□' },
  { href: '/analytics', label: 'Analytics', icon: '∿' },
  { href: '/library', label: 'Library', icon: '⊟' },
]
```

- [ ] **Step 2: Создать `apps/web/src/app/[locale]/(app)/studio/page.tsx`**

```typescript
'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner } from '@/components/ui'
import { Link } from '@/i18n/navigation'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  status: string
  scheduledDate: string
}

interface Campaign {
  id: string
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
  status: string
  createdAt: string
  contentPlan: { id: string; status: string; items: ContentPlanItem[] } | null
}

const GOAL_LABELS: Record<string, string> = {
  SUBSCRIBERS: 'Subscribers',
  SALES: 'Sales',
  ENGAGEMENT: 'Engagement',
  REACH: 'Reach',
}

const STATUS_COLORS: Record<string, 'default' | 'blue' | 'green' | 'yellow' | 'red'> = {
  DRAFT: 'default',
  ACTIVE: 'blue',
  COMPLETED: 'green',
  PAUSED: 'yellow',
}

export default function StudioPage() {
  const { getToken } = useAuth()
  const { workspaceId } = useWorkspace()
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load campaigns')
        const data = await res.json() as { items: Campaign[] }
        setCampaigns(data.items)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      } finally {
        setLoading(false)
      }
    })()
  }, [workspaceId])

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Studio</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered video content factory</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/studio/onboarding')}>
            Company Setup
          </Button>
          <Button onClick={() => router.push('/studio/campaigns/new')}>
            New Campaign
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Set up your company profile and create your first video campaign."
          action={
            <Button onClick={() => router.push('/studio/onboarding')}>
              Get started
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {campaigns.map(campaign => {
            const itemCount = campaign.contentPlan?.items.length ?? 0
            const doneCount = campaign.contentPlan?.items.filter(i =>
              ['CLIENT_REVIEW', 'APPROVED', 'PUBLISHED'].includes(i.status)
            ).length ?? 0

            return (
              <Card key={campaign.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                      <Badge color={STATUS_COLORS[campaign.status] ?? 'default'}>
                        {campaign.status}
                      </Badge>
                      <Badge color="blue">{GOAL_LABELS[campaign.goal]}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">Goal: {campaign.targetAction}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(campaign.startsAt).toLocaleDateString()} — {new Date(campaign.endsAt).toLocaleDateString()}
                    </p>
                    {itemCount > 0 && (
                      <p className="text-xs text-gray-500">{doneCount}/{itemCount} videos ready</p>
                    )}
                  </div>
                  <Link href={`/studio/campaigns/${campaign.id}`}>
                    <Button variant="outline" size="sm">View</Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nav-links.tsx apps/web/src/app/\[locale\]/\(app\)/studio/page.tsx
git commit -m "feat(web): add Studio dashboard page with campaign list"
```

---

## Task 11: Web — Onboarding wizard

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/studio/onboarding/page.tsx`

- [ ] **Step 1: Создать страницу онбординга**

```typescript
'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Spinner, ErrorBanner } from '@/components/ui'

type Step = 'company' | 'portrait' | 'avatar' | 'generate-avatar'

interface CompanyForm {
  companyName: string
  niche: string
  website: string
  description: string
  usp: string
  targetAudience: string
  competitors: string
}

interface AvatarForm {
  description: string
  style: 'professional' | 'casual' | 'energetic' | 'authoritative' | 'friendly'
  gender: 'male' | 'female' | 'neutral'
}

interface Portrait {
  niche: string
  description: string
  usp: string
  targetAudience: string
  competitors: string[]
  contentAngles: string[]
}

export default function OnboardingPage() {
  const { getToken } = useAuth()
  const { workspaceId } = useWorkspace()
  const router = useRouter()
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [step, setStep] = useState<Step>('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [portrait, setPortrait] = useState<Portrait | null>(null)

  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    companyName: '', niche: '', website: '', description: '', usp: '', targetAudience: '', competitors: '',
  })

  const [avatarForm, setAvatarForm] = useState<AvatarForm>({
    description: '', style: 'professional', gender: 'neutral',
  })

  async function handleGeneratePortrait() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/company-portrait/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...companyForm,
          competitors: companyForm.competitors.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as Portrait
      setPortrait(data)
      setStep('portrait')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAvatar() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/avatar-persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(avatarForm),
      })
      if (!res.ok) throw new Error(await res.text())
      setStep('generate-avatar')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateAvatarImage() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/avatar-persona/generate-image`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      router.push('/studio')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const steps: { key: Step; label: string }[] = [
    { key: 'company', label: 'Company Data' },
    { key: 'portrait', label: 'AI Portrait' },
    { key: 'avatar', label: 'Avatar Setup' },
    { key: 'generate-avatar', label: 'Generate Avatar' },
  ]

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Company Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Set up your brand profile for AI content generation</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
              ${step === s.key ? 'bg-indigo-600 text-white' :
                steps.findIndex(x => x.key === step) > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {steps.findIndex(x => x.key === step) > i ? '✓' : i + 1}
            </div>
            <span className="text-xs text-gray-500 hidden sm:block">{s.label}</span>
            {i < steps.length - 1 && <div className="h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Step 1: Company Data */}
      {step === 'company' && (
        <Card className="p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Tell us about your company</h2>
          {[
            { key: 'companyName', label: 'Company name', placeholder: 'Acme Corp' },
            { key: 'niche', label: 'Niche / industry', placeholder: 'B2B SaaS for HR teams' },
            { key: 'website', label: 'Website (optional)', placeholder: 'https://acme.com' },
            { key: 'usp', label: 'Unique selling proposition', placeholder: 'We automate employee onboarding in 1 day' },
            { key: 'targetAudience', label: 'Target audience', placeholder: 'HR managers at companies with 50-500 employees' },
            { key: 'competitors', label: 'Competitors (comma-separated)', placeholder: 'BambooHR, Workday, Rippling' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder={field.placeholder}
                value={companyForm[field.key as keyof CompanyForm]}
                onChange={e => setCompanyForm(f => ({ ...f, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              placeholder="Briefly describe what your company does and why it matters..."
              value={companyForm.description}
              onChange={e => setCompanyForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <Button
            onClick={handleGeneratePortrait}
            disabled={loading || !companyForm.companyName || !companyForm.niche || !companyForm.description || !companyForm.usp || !companyForm.targetAudience}
            className="w-full"
          >
            {loading ? <Spinner size="sm" /> : 'Analyze with AI →'}
          </Button>
        </Card>
      )}

      {/* Step 2: Portrait review */}
      {step === 'portrait' && portrait && (
        <Card className="p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Your Brand Portrait</h2>
          <p className="text-sm text-gray-500">AI has analyzed your company. Review and continue.</p>
          <div className="space-y-3">
            <div><span className="text-xs font-medium text-gray-500 uppercase">Niche</span><p className="text-sm mt-1">{portrait.niche}</p></div>
            <div><span className="text-xs font-medium text-gray-500 uppercase">Description</span><p className="text-sm mt-1">{portrait.description}</p></div>
            <div><span className="text-xs font-medium text-gray-500 uppercase">USP</span><p className="text-sm mt-1">{portrait.usp}</p></div>
            <div><span className="text-xs font-medium text-gray-500 uppercase">Target audience</span><p className="text-sm mt-1">{portrait.targetAudience}</p></div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Content angles</span>
              <ul className="mt-1 space-y-1">
                {portrait.contentAngles.map((a, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-indigo-500">→</span>{a}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('company')}>Back</Button>
            <Button onClick={() => setStep('avatar')} className="flex-1">Looks good →</Button>
          </div>
        </Card>
      )}

      {/* Step 3: Avatar setup */}
      {step === 'avatar' && (
        <Card className="p-6 space-y-4">
          <h2 className="font-medium text-gray-900">Brand Avatar</h2>
          <p className="text-sm text-gray-500">Define the AI persona that will appear in your videos.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Appearance description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
              placeholder="e.g. Mid-30s, short dark hair, confident look, wearing a smart casual blazer"
              value={avatarForm.description}
              onChange={e => setAvatarForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={avatarForm.style}
                onChange={e => setAvatarForm(f => ({ ...f, style: e.target.value as AvatarForm['style'] }))}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="energetic">Energetic</option>
                <option value="authoritative">Authoritative</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={avatarForm.gender}
                onChange={e => setAvatarForm(f => ({ ...f, gender: e.target.value as AvatarForm['gender'] }))}
              >
                <option value="neutral">Neutral</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('portrait')}>Back</Button>
            <Button
              onClick={handleSaveAvatar}
              disabled={loading || !avatarForm.description}
              className="flex-1"
            >
              {loading ? <Spinner size="sm" /> : 'Save avatar →'}
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Generate avatar image */}
      {step === 'generate-avatar' && (
        <Card className="p-6 space-y-4 text-center">
          <div className="text-4xl">🎭</div>
          <h2 className="font-medium text-gray-900">Generate avatar image</h2>
          <p className="text-sm text-gray-500">
            We'll create a reference portrait for your brand avatar using AI image generation.
            This takes about 1-2 minutes.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/studio')} className="flex-1">
              Skip for now
            </Button>
            <Button onClick={handleGenerateAvatarImage} disabled={loading} className="flex-1">
              {loading ? <><Spinner size="sm" /> Generating…</> : 'Generate image'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/(app)/studio/onboarding/page.tsx"
git commit -m "feat(web): add company onboarding wizard (4-step: data → portrait → avatar → generate)"
```

---

## Task 12: Web — Campaign creation page

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/studio/campaigns/new/page.tsx`

- [ ] **Step 1: Создать страницу**

```typescript
'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from '@/i18n/navigation'
import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Spinner, ErrorBanner } from '@/components/ui'

type Goal = 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'

const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: 'SALES', label: 'Sales', description: 'Drive purchases, bookings, sign-ups' },
  { value: 'SUBSCRIBERS', label: 'Subscribers', description: 'Grow followers across platforms' },
  { value: 'ENGAGEMENT', label: 'Engagement', description: 'Maximize likes, comments, shares' },
  { value: 'REACH', label: 'Reach', description: 'Brand awareness and visibility' },
]

export default function NewCampaignPage() {
  const { getToken } = useAuth()
  const { workspaceId } = useWorkspace()
  const router = useRouter()
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    goal: 'SALES' as Goal,
    targetAction: '',
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  })

  async function handleSubmit() {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      const campaign = await res.json() as { id: string }
      router.push(`/studio/campaigns/${campaign.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
        <p className="text-sm text-gray-500 mt-1">AI will generate a full content plan based on your brand and goal</p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign name</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g. July Product Launch"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Campaign goal</label>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, goal: opt.value }))}
                className={`text-left p-3 rounded-lg border-2 transition-colors
                  ${form.goal === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target action</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g. Book a free consultation call"
            value={form.targetAction}
            onChange={e => setForm(f => ({ ...f, targetAction: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">What should viewers do after watching?</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.startsAt}
              onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.endsAt}
              onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/studio')}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.targetAction}
            className="flex-1"
          >
            {loading ? <Spinner size="sm" /> : 'Create campaign →'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/(app)/studio/campaigns/new/page.tsx"
git commit -m "feat(web): add campaign creation page with goal selection"
```

---

## Task 13: Web — Campaign view (timeline + plan generation)

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/studio/campaigns/[id]/page.tsx`

- [ ] **Step 1: Создать страницу**

```typescript
'use client'

import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, ErrorBanner } from '@/components/ui'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  format: string
  scheduledDate: string
  hook: string
  status: string
  rejectComment: string | null
  scriptId: string | null
  videoJobId: string | null
}

interface Campaign {
  id: string
  name: string
  goal: string
  targetAction: string
  startsAt: string
  endsAt: string
  status: string
  contentPlan: { id: string; status: string; items: ContentPlanItem[] } | null
}

const ITEM_STATUS_COLORS: Record<string, 'default' | 'blue' | 'yellow' | 'green' | 'red'> = {
  PENDING: 'default',
  SCRIPTING: 'blue',
  SCRIPTED: 'blue',
  VIDEO_QUEUED: 'yellow',
  VIDEO_GENERATING: 'yellow',
  VIDEO_DONE: 'blue',
  CLIENT_REVIEW: 'yellow',
  APPROVED: 'green',
  PUBLISHED: 'green',
  REJECTED: 'red',
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  SCRIPTING: 'Writing script…',
  SCRIPTED: 'Script ready',
  VIDEO_QUEUED: 'Queued',
  VIDEO_GENERATING: 'Generating video…',
  VIDEO_DONE: 'Video ready',
  CLIENT_REVIEW: 'Awaiting approval',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
}

const IN_PROGRESS_STATUSES = new Set(['SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'])

export default function CampaignPage() {
  const { getToken } = useAuth()
  const { workspaceId } = useWorkspace()
  const params = useParams()
  const campaignId = params.id as string
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCampaign = useCallback(async () => {
    if (!workspaceId) return
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load campaign')
      setCampaign(await res.json() as Campaign)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, campaignId])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])

  // Poll while items are in progress
  useEffect(() => {
    if (!campaign?.contentPlan) return
    const hasInProgress = campaign.contentPlan.items.some(i => IN_PROGRESS_STATUSES.has(i.status))
    if (!hasInProgress) return
    const timer = setInterval(fetchCampaign, 10_000)
    return () => clearInterval(timer)
  }, [campaign, fetchCampaign])

  async function handleGeneratePlan() {
    if (!workspaceId) return
    setGenerating(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/content-plan/generate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleApprovePlan() {
    if (!workspaceId) return
    setApproving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/approve-plan`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setApproving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>
  if (!campaign) return <div className="p-6 text-gray-500">Campaign not found</div>

  const planStatus = campaign.contentPlan?.status
  const items = campaign.contentPlan?.items ?? []
  const canGenerate = !planStatus || planStatus === 'DRAFT'
  const canApprove = planStatus === 'DRAFT' && items.length > 0
  const isProducing = planStatus === 'IN_PRODUCTION'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Goal: {campaign.targetAction}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(campaign.startsAt).toLocaleDateString()} — {new Date(campaign.endsAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {canGenerate && (
            <Button variant="outline" onClick={handleGeneratePlan} disabled={generating}>
              {generating ? <><Spinner size="sm" /> Generating…</> : items.length > 0 ? 'Regenerate plan' : 'Generate plan'}
            </Button>
          )}
          {canApprove && (
            <Button onClick={handleApprovePlan} disabled={approving}>
              {approving ? <Spinner size="sm" /> : 'Approve & Start Production →'}
            </Button>
          )}
          {isProducing && (
            <Badge color="yellow">Production in progress…</Badge>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {items.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-gray-500">No content plan yet.</p>
          <Button onClick={handleGeneratePlan} disabled={generating}>
            {generating ? <><Spinner size="sm" /> Generating…</> : 'Generate content plan with AI'}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Content Plan ({items.length} videos)</h2>
            {planStatus && <Badge color={planStatus === 'APPROVED' || planStatus === 'IN_PRODUCTION' ? 'blue' : planStatus === 'COMPLETED' ? 'green' : 'default'}>{planStatus}</Badge>}
          </div>
          {items.map(item => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-medium shrink-0">
                  {item.index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{item.topic}</span>
                    <Badge color={ITEM_STATUS_COLORS[item.status] ?? 'default'}>
                      {ITEM_STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                    {IN_PROGRESS_STATUSES.has(item.status) && <Spinner size="sm" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 italic">"{item.hook}"</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.scheduledDate).toLocaleDateString()} · {item.format}
                  </p>
                  {item.rejectComment && (
                    <p className="text-xs text-red-500 mt-1">Rejected: {item.rejectComment}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/(app)/studio/campaigns/[id]/page.tsx"
git commit -m "feat(web): add campaign timeline view with auto-polling during production"
```

---

## Task 14: Web — Client review page

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/review/campaigns/[id]/page.tsx`

- [ ] **Step 1: Создать страницу проверки для CLIENT**

```typescript
'use client'

import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, ErrorBanner } from '@/components/ui'

interface ContentPlanItem {
  id: string
  index: number
  topic: string
  hook: string
  scheduledDate: string
  status: string
  rejectComment: string | null
  videoJobId: string | null
}

interface VideoJob {
  id: string
  outputUrl: string | null
  status: string
}

interface Campaign {
  id: string
  name: string
  targetAction: string
  contentPlan: { items: ContentPlanItem[] } | null
}

export default function ReviewCampaignPage() {
  const { getToken } = useAuth()
  const { workspaceId } = useWorkspace()
  const params = useParams()
  const campaignId = params.id as string
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [videoJobs, setVideoJobs] = useState<Record<string, VideoJob>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)

  const fetchCampaign = useCallback(async () => {
    if (!workspaceId) return
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json() as Campaign
      setCampaign(data)

      // Fetch video jobs for CLIENT_REVIEW items
      const reviewItems = data.contentPlan?.items.filter(i => i.status === 'CLIENT_REVIEW' && i.videoJobId) ?? []
      const jobs: Record<string, VideoJob> = {}
      await Promise.all(reviewItems.map(async item => {
        if (!item.videoJobId) return
        const vRes = await fetch(`${API}/workspaces/${workspaceId}/video-jobs/${item.videoJobId}`, {
          headers: { authorization: `Bearer ${token}` },
        })
        if (vRes.ok) jobs[item.videoJobId] = await vRes.json() as VideoJob
      }))
      setVideoJobs(jobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, campaignId])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])

  async function handleApprove(itemId: string) {
    if (!workspaceId) return
    setActionLoading(itemId)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}/approve`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchCampaign()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(itemId: string) {
    if (!workspaceId || !rejectComment[itemId]) return
    setActionLoading(itemId)
    try {
      const token = await getToken()
      const res = await fetch(`${API}/workspaces/${workspaceId}/campaigns/${campaignId}/items/${itemId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: rejectComment[itemId] }),
      })
      if (!res.ok) throw new Error(await res.text())
      setRejectOpen(null)
      await fetchCampaign()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>
  if (!campaign) return <div className="p-6 text-gray-500">Campaign not found</div>

  const reviewItems = campaign.contentPlan?.items.filter(i => i.status === 'CLIENT_REVIEW') ?? []
  const otherItems = campaign.contentPlan?.items.filter(i => i.status !== 'CLIENT_REVIEW') ?? []

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve videos before publishing</p>
      </div>

      {error && <ErrorBanner message={error} />}

      {reviewItems.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No videos awaiting your review.</p>
          <p className="text-xs text-gray-400 mt-2">Check back when new videos are ready.</p>
        </Card>
      )}

      {reviewItems.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-medium text-gray-900">Awaiting your approval ({reviewItems.length})</h2>
          {reviewItems.map(item => {
            const videoJob = item.videoJobId ? videoJobs[item.videoJobId] : null
            const isActing = actionLoading === item.id
            const isRejectOpen = rejectOpen === item.id

            return (
              <Card key={item.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{item.topic}</h3>
                    <p className="text-xs text-gray-500 italic mt-1">"{item.hook}"</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(item.scheduledDate).toLocaleDateString()}</p>
                  </div>
                  <Badge color="yellow">Needs review</Badge>
                </div>

                {videoJob?.outputUrl ? (
                  <video
                    src={videoJob.outputUrl}
                    controls
                    className="w-full rounded-lg aspect-[9/16] bg-black object-contain max-h-96"
                  />
                ) : (
                  <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                    <p className="text-sm text-gray-400">Video loading…</p>
                  </div>
                )}

                {!isRejectOpen ? (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => setRejectOpen(item.id)}
                      disabled={isActing}
                    >
                      Reject
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(item.id)}
                      disabled={isActing}
                    >
                      {isActing ? <Spinner size="sm" /> : '✓ Approve & Schedule'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      rows={2}
                      placeholder="What needs to be changed?"
                      value={rejectComment[item.id] ?? ''}
                      onChange={e => setRejectComment(r => ({ ...r, [item.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setRejectOpen(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => handleReject(item.id)}
                        disabled={isActing || !rejectComment[item.id]}
                      >
                        {isActing ? <Spinner size="sm" /> : 'Send rejection'}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {otherItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium text-gray-700 text-sm">Other videos</h2>
          {otherItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">{item.topic}</span>
              <Badge color={item.status === 'PUBLISHED' || item.status === 'APPROVED' ? 'green' : item.status === 'REJECTED' ? 'red' : 'default'}>
                {item.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/[locale]/(app)/review/campaigns/[id]/page.tsx"
git commit -m "feat(web): add client review page for campaign video approval"
```

---

## Task 15: Start video-worker + end-to-end smoke test

**Files:** нет изменений кода

- [ ] **Step 1: Запустить video-worker**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
pnpm --filter @contento/video-worker run dev > /tmp/contento-video-worker.log 2>&1 &
echo "Video worker PID: $!"
sleep 5
tail -5 /tmp/contento-video-worker.log
```

Ожидаемый вывод: воркер стартует без ошибок

- [ ] **Step 2: Убедиться что все сервисы живы**

```bash
curl -s http://localhost:3001/health
docker ps --format "table {{.Names}}\t{{.Status}}" | grep infra
```

Ожидаемый вывод: API `{"status":"ok"}`, postgres/redis/kafka/minio — Up (healthy)

- [ ] **Step 3: Smoke test через API — создать портрет компании**

```bash
# Получить токен из браузера (скопировать из DevTools → Network → любой API запрос → Authorization header)
# Или использовать тестовый воркспейс
TOKEN="<вставить Bearer token из браузера>"
WS_ID="<вставить workspaceId>"

curl -s -X POST http://localhost:3001/workspaces/$WS_ID/company-portrait/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"TestCo","niche":"B2B SaaS","description":"We automate reporting","usp":"Save 10 hours/week","targetAudience":"Finance managers","competitors":["Tableau","PowerBI"]}' \
  | python3 -m json.tool | head -20
```

Ожидаемый вывод: JSON с `niche`, `contentAngles[]`

- [ ] **Step 4: Smoke test — создать кампанию и сгенерировать контент-план**

```bash
CAMPAIGN=$(curl -s -X POST http://localhost:3001/workspaces/$WS_ID/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Campaign","goal":"SALES","targetAction":"Book a call","startsAt":"2026-07-01","endsAt":"2026-07-14"}')
CAMPAIGN_ID=$(echo $CAMPAIGN | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Campaign ID: $CAMPAIGN_ID"

curl -s -X POST http://localhost:3001/workspaces/$WS_ID/campaigns/$CAMPAIGN_ID/content-plan/generate \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Generated {len(d[\"items\"])} items'); [print(f'  {i[\"index\"]+1}. {i[\"topic\"]} — {i[\"hook\"][:60]}') for i in d['items']]"
```

Ожидаемый вывод: `Generated N items` с темами и хуками

- [ ] **Step 5: Включить MOCK режим и запустить production (опционально)**

Добавить в `apps/api/.env`:
```
HIGGSFIELD_MOCK=1
```

Перезапустить API. Затем:
```bash
curl -s -X POST http://localhost:3001/workspaces/$WS_ID/campaigns/$CAMPAIGN_ID/approve-plan \
  -H "Authorization: Bearer $TOKEN"
```

Ожидаемый вывод: `{"message":"Content plan approved. Video production started."}`

Через 1-2 минуты:
```bash
curl -s http://localhost:3001/workspaces/$WS_ID/campaigns/$CAMPAIGN_ID \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'  {i[\"topic\"]}: {i[\"status\"]}') for i in (d['contentPlan']['items'] if d['contentPlan'] else [])]"
```

Ожидаемый вывод: статусы `CLIENT_REVIEW` для завершённых видео

- [ ] **Step 6: Финальный commit**

```bash
git add -A
git commit -m "feat: complete Campaign architecture implementation (Studio end-to-end flow)"
```

---

## Порядок выполнения

```
Task 1  → Task 2 → Task 3 → Task 4  (фундамент: DB + AI агенты)
Task 5  → Task 6 → Task 7 → Task 8  (API маршруты)
Task 9                               (подключить в server.ts)
Task 10 → Task 11 → Task 12 → Task 13 → Task 14  (Web UI)
Task 15                              (запуск + smoke test)
```

Каждый task можно делать независимо внутри своей группы. Между группами — последовательно.
