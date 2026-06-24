FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# ── install all workspace dependencies ────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY apps/api/package.json           apps/api/
COPY apps/posting-service/package.json apps/posting-service/
COPY apps/render-worker/package.json apps/render-worker/
COPY apps/scheduler/package.json     apps/scheduler/
COPY apps/trend-analyzer/package.json apps/trend-analyzer/
COPY apps/video-worker/package.json  apps/video-worker/
COPY apps/web/package.json           apps/web/
COPY packages/ai/package.json        packages/ai/
COPY packages/brand-kit/package.json packages/brand-kit/
COPY packages/db/package.json        packages/db/
COPY packages/notifications/package.json packages/notifications/
COPY packages/platforms/package.json packages/platforms/
COPY packages/shared/package.json    packages/shared/
COPY packages/ui/package.json        packages/ui/
# Prisma schema must exist before install so prisma generate produces Linux binaries
COPY packages/db/prisma              packages/db/prisma/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter=@contento/db exec prisma generate

# ── one-shot migration runner ─────────────────────────────────────────────────
FROM deps AS migrate
CMD ["pnpm", "--filter", "@contento/db", "exec", "prisma", "migrate", "deploy"]

# ── build a specific app and its workspace dependencies ───────────────────────
FROM deps AS builder
ARG APP=api
COPY . .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm exec turbo run build --filter=@contento/${APP}...
# --legacy: pnpm v10 refuses non-injected workspace deploys without it
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter=@contento/${APP} deploy --prod --legacy /deploy

# ── lean production runner (non-web apps) ─────────────────────────────────────
# tsc raises rootDir to the monorepo root (base tsconfig `paths` resolve @contento/*
# to sibling src), so each app's entry emits at dist/apps/<APP>/src/index.js — there
# is NO dist/index.js. CMD is shell-form so $APP expands at runtime.
FROM node:22-alpine AS runner
ARG APP=api
ENV NODE_ENV=production
ENV APP=$APP
WORKDIR /app
COPY --from=builder /deploy .
CMD node dist/apps/$APP/src/index.js

# ── video-worker runner: same as runner + ffmpeg/ffprobe (stitch.ts shells out) ──
# Remotion's chrome-headless-shell is downloaded at runtime (same as render-worker on
# this base image). Build via:  --build-arg APP=video-worker  --target video-runner
#
# NOTE the unusual entry path: video-worker's tsconfig `paths` point at sibling-package
# *src* (unlike the other workers, which point at dist), so `tsc --build` raises rootDir
# to the monorepo root and emits the entry at dist/apps/video-worker/src/index.js — there
# is NO dist/index.js. Proper fix (deferred): align its tsconfig paths to sibling dist
# like @contento/brand-kit already is, then this becomes plain dist/index.js.
FROM node:22-alpine AS video-runner
ARG APP=video-worker
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /deploy .
CMD ["node", "dist/apps/video-worker/src/index.js"]

# ── Next.js: build with standalone output ─────────────────────────────────────
# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, so they must be
# present here (not just at runtime). Passed through from compose build.args.
FROM deps AS web-builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm exec turbo run build --filter=@contento/web...

# ── Next.js standalone runner ─────────────────────────────────────────────────
FROM node:22-alpine AS web-runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=web-builder /app/apps/web/public           ./apps/web/public
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
