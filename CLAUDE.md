# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Contento is an AI-powered SMM content factory. The core loop is: **Trend → Idea → Script → Brand Check → Publish**. It is a TypeScript monorepo (pnpm + Turborepo) with a Next.js frontend, Fastify API, multiple background workers, and optional Python workers for scraping and ML.

## Commands

```bash
# Install dependencies
pnpm install

# Run everything in dev mode (parallel)
pnpm dev

# Build all packages and apps
pnpm build

# Typecheck all
pnpm typecheck

# Lint all
pnpm lint

# Run all tests
pnpm test

# Format code
pnpm format

# Target a specific package
pnpm --filter @contento/api run dev
pnpm --filter @contento/web run dev

# Run a single test file
pnpm --filter @contento/api exec vitest run src/routes/content.test.ts
```

### Database (Prisma)

After any schema change, you must regenerate the client and rebuild the package:

```bash
pnpm --filter @contento/db run db:generate-and-build   # generate + tsc
pnpm --filter @contento/db run db:migrate              # apply migrations (dev)
pnpm --filter @contento/db run db:push                 # push schema without migration (proto)
```

CI also runs `pnpm --filter @contento/db run db:generate` before tests — the generated client is not committed.

### Infrastructure (Docker)

```bash
# Copy and fill secrets first
cp infra/.env.example infra/.env

# Start core infra (Postgres, Redis, Kafka, MinIO, ClickHouse)
docker compose -f infra/docker-compose.yml up -d

# Optional Python worker profiles
docker compose -f infra/docker-compose.yml --profile scrapers up -d
docker compose -f infra/docker-compose.yml --profile analytics up -d
docker compose -f infra/docker-compose.yml --profile mentions up -d
docker compose -f infra/docker-compose.yml --profile ml up -d
```

## Architecture

### Monorepo Layout

```
apps/
  api/            # Fastify 5 REST API — the backend hub
  web/            # Next.js 15 frontend (App Router, Turbopack)
  posting-service # BullMQ worker: dequeues and publishes to social platforms
  render-worker   # BullMQ worker: renders content visuals via Remotion, uploads to S3/MinIO
  scheduler       # BullMQ worker: fires scheduled publications, sends trend digest
  trend-analyzer  # BullMQ worker: calls AI to score trend relevance
  trend-fetcher   # BullMQ worker: fetches trends from YouTube/Reddit/Google/RSS

packages/
  db/             # @contento/db — Prisma client + schema (PostgreSQL + pgvector)
  ai/             # @contento/ai — Anthropic SDK wrapper + AI agents
  brand-kit/      # @contento/brand-kit — Remotion video composition templates
  platforms/      # @contento/platforms — platform publisher adapters (TG/IG/TikTok/YT/LI/VK)
  shared/         # @contento/shared — shared Zod schemas and TS types
  ui/             # @contento/ui — shared React components

workers/ (Python)
  scrapers-py     # Google Trends / YouTube / Reddit / RSS → publishes to Kafka
  analytics-py    # Consumes Kafka events → writes to ClickHouse
  mention-py      # Monitors brand mentions via RSS/Reddit → Postgres
  ml-py           # LoRA fine-tuning worker

infra/
  docker-compose.yml  # Full local stack
```

### Infrastructure Stack

| Service    | Role |
|------------|------|
| PostgreSQL (pgvector) | Primary database; stores embeddings for golden examples and scripts |
| Redis      | BullMQ queue backend |
| Kafka (KRaft) + Karapace | Event bus: trends, analytics events, mention ingestion |
| MinIO      | S3-compatible object storage for rendered media |
| ClickHouse | Analytics/LLM usage metrics |

### API (`apps/api`)

Fastify 5 with `fastify-type-provider-zod` for request/response validation. All routes are workspace-scoped under `/workspaces/:workspaceId/...`.

**Auth**: Clerk JWT via `Authorization: Bearer <token>`. When `CLERK_SECRET_KEY` is unset, the API falls back to decoding the JWT without verification (dev only).

**RBAC** (`src/middleware/rbac.ts`): Role hierarchy `OWNER > ADMIN > APPROVER > EDITOR/AUTHOR/DESIGNER > VIEWER > CLIENT`. Use `requireRole(...)`, `requireMinRole(...)`, or the named shorthands `requireWriteRole` / `requireApprovalRole`.

**BullMQ queues** (`src/queue.ts`): `render`, `trend-fetch`, `hooks-evolve`. Workers live in separate apps but share the same Redis.

**Background workers** started in `onReady`: mention poller and analytics ingester run inside the API process.

Swagger UI is available at `/docs` when the server is running.

### AI Pipeline (`packages/ai`)

`buildBrandContext(workspaceId)` assembles a Brand Knowledge Base from the database and returns it as an Anthropic `cache_control: ephemeral` text block to minimize token cost.

Agents in `packages/ai/src/agents/`:
- `trend-analyzer` — scores trend relevance against brand pillars
- `idea-generator` — produces 5–10 content ideas from a trend + brand context
- `scriptwriter` — writes hook/body/CTA/caption/hashtags
- `brand-checker` — scores a script 0–100 against tone, vocabulary, pillars, personas
- `variant-generator`, `series-planner`, `storyboard`, `cover-concept`, `music-suggester`, `recommender`

All agents receive the brand context block as the first system message so the cache hit rate is high.

### Web App (`apps/web`)

Next.js 15 App Router. Routes are under `src/app/[locale]/(app)/` (authenticated) and `src/app/[locale]/(auth)/` (sign-in/sign-up).

i18n via `next-intl`; locale is the first path segment. Message files: `src/messages/en.json` and `src/messages/ru.json`.

The web app calls the API directly from the browser at `NEXT_PUBLIC_API_URL`. There are no Next.js API routes — all mutations go to `apps/api`.

### Publishing Pipeline

1. User approves a script → `Publication` row created with `status: PENDING` and optional `scheduledAt`.
2. `scheduler` app polls for due publications and enqueues jobs.
3. `posting-service` worker dequeues and calls `createPublisher(platform, credentials)` from `@contento/platforms`.
4. On success, `Publication.status` → `PUBLISHED`; on failure → `FAILED` with `errorMessage`.

### Multi-tenancy

All data is scoped to a `Workspace`. Every API route extracts `workspaceId` from the path and the RBAC middleware verifies the calling user is a member with sufficient role.

### TypeScript ESM Convention

All packages use `"module": "NodeNext"`. Import paths in source files use `.js` extensions even for `.ts` files (`import { foo } from './foo.js'`). Webpack in the Next.js app handles this via `extensionAlias` in `next.config.ts`.

### Adding a New Package

1. Create `packages/<name>/package.json` with `"type": "module"` and the standard `build`/`dev`/`test` scripts.
2. Extend `tsconfig.base.json` paths to add `@contento/<name>`.
3. Reference it in other packages via `"@contento/<name>": "workspace:*"`.
4. Turbo automatically builds dependencies in order before dependents.
