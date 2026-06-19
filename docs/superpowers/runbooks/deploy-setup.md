# Deploy setup runbook (finishing the push-to-main pipeline)

The repo already has a CI/CD pipeline: **`.github/workflows/ci.yml`** (lint/typecheck/test — now green) and **`.github/workflows/deploy.yml`** (deploys on every push to `main`). The deploy targets:
- **Web** → Vercel
- **API, posting-service, render-worker, scheduler** → Fly.io (each has its own `apps/<app>/fly.toml`)

As of this writing the **CI is green** but the **Deploy workflow fails** because the deploy credentials aren't configured and the DB migrations are missing. Two gates to close:

---

## Gate 1 — GitHub Actions secrets (deploy auth)

The deploy steps run `npx vercel --prod --token=$VERCEL_TOKEN` and `flyctl deploy --app contento-* ` — both fail with empty/absent tokens (confirmed: the Vercel step ran with `--token=` empty, `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` empty; Fly fails without `FLY_API_TOKEN`).

Add these in **GitHub → repo Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Where to get it |
|--------|-----------------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens → Create |
| `VERCEL_ORG_ID` | `vercel link` locally → `.vercel/project.json` (`orgId`), or Vercel project settings |
| `VERCEL_PROJECT_ID` | same `.vercel/project.json` (`projectId`) |
| `FLY_API_TOKEN` | `fly tokens create deploy` (Fly.io CLI), or Fly dashboard → Tokens |

The four Fly apps must exist first (`fly apps create contento-api`, `contento-posting-service`, `contento-render-worker`, `contento-scheduler`) — the `fly.toml` files are committed, so `fly launch --no-deploy` / `fly deploy` from each app dir will register them. The Vercel project must be created/linked once (`vercel link` in `apps/web`).

- [ ] `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `FLY_API_TOKEN` set as repo secrets.
- [ ] Four Fly apps created; Vercel project linked.

---

## Gate 2 — Database migrations (the runtime blocker)

This session built features behind schema changes (`PublicationMetric`, `QaCheck`, `Campaign.targetPlatforms`, `ContentPlanItem.platform`, `VideoShot.shotType/headline/audioUrl/screencast*`, `Publication.videoJobId/metricsHistory`, `GoldenExample.sourceScriptId/promotedAt`, `AssetKind.SCREENCAST`). The schema has been on **`db:push` since the initial commit — there are NO SQL migrations** for any of it (the last committed migration is `20260526000000_add_video_job_language`). The Dockerfile has a `migrate` stage (`prisma migrate deploy`) but it can only apply **committed** migrations — which don't include this work. A deploy would bring up an API whose Prisma client expects columns/tables the production DB lacks → runtime crashes.

**Generate + commit the migrations (needs a reachable Postgres):**
```bash
# point DATABASE_URL at a dev/staging Postgres, then:
pnpm --filter @contento/db run db:migrate        # = prisma migrate dev — generates the SQL from the schema drift
git add packages/db/prisma/migrations && git commit -m "feat(db): generate SQL migrations for the schema drift since initial commit"
```
This produces one (large) consolidating migration for all the drift. Review it, then ensure the deploy runs `prisma migrate deploy` against production (either the Dockerfile `migrate` stage as a Fly release step, or a Fly `release_command` / one-off `fly ssh console -C "...migrate deploy"`).

Also generate the **pgvector indexes** the feedback loop wants (the Prisma schema can't express `ivfflat`/`hnsw` — add by hand to the migration SQL):
```sql
CREATE INDEX IF NOT EXISTS golden_example_embedding_idx
  ON "GoldenExample" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```
(`Script_embedding_idx` already exists from an earlier migration.)

- [ ] SQL migration generated + committed.
- [ ] `prisma migrate deploy` wired into the deploy (release step) and run against production.
- [ ] pgvector index on `GoldenExample.embedding` added.

---

## After both gates

Push to `main` → CI (green) → Deploy runs: Vercel builds `apps/web`, Fly deploys the four services, migrations apply. Then set the runtime env on each Fly app (`fly secrets set` for `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, S3/MinIO, Higgsfield/ElevenLabs keys, etc.).

> Note: **video-worker and trend-fetcher are NOT in `deploy.yml`** (no deploy job, not in the Dockerfile's copy list). The heavy video render/stitch (Plan B/B2) runs there — add deploy jobs + a `fly.toml` for them when that path goes to production. The render-worker IS deployed (PNG visuals).

## Links
| What | Link |
|------|------|
| Repo (CI/CD) | https://github.com/c01der-js/contento |
| GitHub Actions secrets | https://github.com/c01der-js/contento/settings/secrets/actions |
| Vercel | https://vercel.com/ |
| Fly.io | https://fly.io/ |
| Vercel tokens | https://vercel.com/account/tokens |
