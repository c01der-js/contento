# Debian (glibc) build for video-worker.
#
# Why a dedicated Dockerfile (the rest of the stack uses the Alpine shared Dockerfile):
# Remotion's native compositor (Rust frame-extractor) and chrome-headless-shell are
# glibc binaries — they SIGSEGV / fail to launch on Alpine/musl. Building here on
# node:22-bookworm-slim makes pnpm select the glibc Remotion compositor and lets us use
# the system (glibc) Chromium, so video rendering actually works.
#
# Build:  docker build -f apps/video-worker/Dockerfile -t contento-video-worker .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# ── install all workspace deps (frozen lockfile needs every importer's package.json) ──
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json            apps/api/
COPY apps/posting-service/package.json apps/posting-service/
COPY apps/render-worker/package.json  apps/render-worker/
COPY apps/scheduler/package.json      apps/scheduler/
COPY apps/trend-analyzer/package.json apps/trend-analyzer/
COPY apps/trend-fetcher/package.json  apps/trend-fetcher/
COPY apps/video-worker/package.json   apps/video-worker/
COPY apps/web/package.json            apps/web/
COPY packages/ai/package.json         packages/ai/
COPY packages/brand-kit/package.json  packages/brand-kit/
COPY packages/db/package.json         packages/db/
COPY packages/notifications/package.json packages/notifications/
COPY packages/platforms/package.json  packages/platforms/
COPY packages/shared/package.json     packages/shared/
COPY packages/ui/package.json         packages/ui/
# Prisma schema before install so the client generates the glibc (native=debian) binary.
COPY packages/db/prisma               packages/db/prisma/
RUN --mount=type=cache,id=pnpm-deb,target=/pnpm/store pnpm install --frozen-lockfile

# ── build video-worker + its workspace deps ───────────────────────────────────
FROM deps AS builder
COPY . .
RUN --mount=type=cache,id=turbo-deb,target=/app/.turbo \
    pnpm --filter=@contento/db exec prisma generate && \
    pnpm exec turbo run build --filter=@contento/video-worker...
RUN --mount=type=cache,id=pnpm-deb,target=/pnpm/store \
    pnpm --filter=@contento/video-worker deploy --prod --legacy /deploy

# ── glibc runtime: ffmpeg + system Chromium + fonts ───────────────────────────
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg chromium fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
# Point Remotion at the system glibc Chromium (Debian's setpriv supports --pdeathsig).
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium
COPY --from=builder /deploy .
# Nested entry: video-worker's tsconfig paths→sibling src raise tsc rootDir to the repo
# root, so the entry emits at dist/apps/video-worker/src/index.js (no dist/index.js).
CMD ["node", "dist/apps/video-worker/src/index.js"]
