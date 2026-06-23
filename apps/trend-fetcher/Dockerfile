FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/trend-fetcher/package.json apps/trend-fetcher/
COPY packages/db/package.json        packages/db/
COPY packages/shared/package.json    packages/shared/
COPY packages/db/prisma              packages/db/prisma/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN --mount=type=cache,id=turbo,target=/app/.turbo \
    pnpm --filter=@contento/db exec prisma generate && \
    pnpm exec turbo run build --filter=@contento/trend-fetcher...
RUN pnpm --filter=@contento/trend-fetcher deploy --prod --legacy /deploy

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /deploy .
# Entry emits under dist/apps/trend-fetcher/src/ (base tsconfig paths pull sibling
# src, raising tsc rootDir to the monorepo root — there is no dist/index.js).
CMD ["node", "dist/apps/trend-fetcher/src/index.js"]
