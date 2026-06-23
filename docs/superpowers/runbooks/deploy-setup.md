# Deploy setup runbook — self-hosted VPS over SSH

The deploy target is a **self-hosted VPS** (not Vercel/Fly). On every push to `main`,
**`.github/workflows/deploy.yml`** SSHes into the server, fast-forwards the repo, and runs
**`scripts/deploy.sh`**, which rebuilds + restarts the whole Docker Compose stack
(**`infra/docker-compose.yml`** — api, web, posting-service, render-worker, scheduler,
trend-* + postgres/redis/kafka/minio/clickhouse + a one-shot `migrate`).

CI (`ci.yml`) is green. To make the deploy work, close the gates below.

---

## Gate 1 — SSH key auth (NEVER the root password)

CI deploy must authenticate with an **SSH key**, not a password. Do this once:

1. **Generate a deploy keypair** (on your laptop, no passphrase so CI can use it):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/contento_deploy -C "github-deploy" -N ""
   ```
2. **Authorize the public key on the server:**
   ```bash
   ssh root@188.94.191.142   # first time, with the panel password (interactive — not stored anywhere)
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo "<contents of ~/.ssh/contento_deploy.pub>" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
   (Better than `root`: create a `deploy` user with docker access and use that.)
3. **Add the PRIVATE key + host as GitHub repo secrets** — Settings → Secrets and variables → Actions → New repository secret:

   | Secret | Value |
   |--------|-------|
   | `VPS_HOST` | `188.94.191.142` |
   | `VPS_USER` | `root` (or your `deploy` user) |
   | `VPS_SSH_KEY` | the **full contents** of `~/.ssh/contento_deploy` (the private key) |
   | `VPS_PORT` | `22` (or your custom SSH port) |
   | `VPS_DEPLOY_PATH` | absolute path of the repo on the server, e.g. `/opt/contento` |

- [ ] Keypair generated; public key in the server's `authorized_keys`.
- [ ] `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` / `VPS_PORT` / `VPS_DEPLOY_PATH` set as repo secrets.

---

## Gate 2 — Server prerequisites (one-time)

On the VPS (`ssh root@188.94.191.142`):

1. **Install Docker + Compose v2:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   docker compose version   # must print v2.x
   ```
2. **Clone the repo to `VPS_DEPLOY_PATH`:**
   ```bash
   git clone https://github.com/c01der-js/contento.git /opt/contento
   cd /opt/contento
   ```
3. **Create `infra/.env`** from the example and fill the real secrets:
   ```bash
   cp infra/.env.example infra/.env
   # then edit infra/.env — at minimum:
   #   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB   (strong password!)
   #   MINIO_ROOT_USER / MINIO_ROOT_PASSWORD             (strong password!)
   #   S3_BUCKET=contento-media
   #   ANTHROPIC_API_KEY=...          (agents)
   #   OPENAI_API_KEY=...             (feedback-loop embeddings; omit → mock embeddings)
   #   CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   (auth)
   #   NEXT_PUBLIC_API_URL=http://188.94.191.142:3001        (web → api, by IP for now)
   #   HIGGSFIELD / ELEVENLABS keys (video), YOUTUBE_API_KEY (trends/metrics)
   ```

- [ ] Docker + Compose v2 installed.
- [ ] Repo cloned at `VPS_DEPLOY_PATH`.
- [ ] `infra/.env` filled with strong passwords + API keys.

---

## Gate 3 — Database schema ✅ RESOLVED (squashed baseline migration)

**Fixed (2026-06-23).** The old migration history (18 migrations) was **not replayable** — a fresh
`prisma migrate deploy` crashed at the 2nd migration (`column "scheduledAt" … already exists`),
because the schema had drifted under `db:push` while migrations were only intermittently generated.
That meant the compose `migrate` service could never succeed on a fresh server DB.

It has been replaced by a single squashed baseline that captures the **entire current schema**
(`PublicationMetric`, `QaCheck`, `Campaign.targetPlatforms`, `VideoShot.shotType/headline/…`,
`Publication.videoJobId/metricsHistory`, `GoldenExample.sourceScriptId/promotedAt`, `AssetKind.SCREENCAST`,
the `vector` extension + embedding columns, …):

```
packages/db/prisma/migrations/20260623000000_baseline_squash/migration.sql
```

It was generated with `prisma migrate diff --from-empty --to-schema-datamodel` and **validated**:
`migrate deploy` applies it cleanly on a fresh DB, and `migrate diff` then reports
**"No difference detected"** vs `schema.prisma` (zero drift, in all Prisma workflows). The 18 broken
migrations are archived under `packages/db/prisma/_broken_migrations_archive/` (Prisma ignores them).

**Nothing to do for this gate** — the compose `migrate` service (`prisma migrate deploy`) now
creates the full schema automatically on first deploy against the fresh server DB.

> **pgvector index (deferred, optional perf):** the feedback-loop search (`embedding <=> …`, cosine)
> runs without an index — fine at beta scale (≪ 10k vectors). When volume grows, add HNSW indexes:
> ```sql
> CREATE INDEX IF NOT EXISTS "GoldenExample_embedding_idx" ON "GoldenExample" USING hnsw ("embedding" vector_cosine_ops);
> CREATE INDEX IF NOT EXISTS "Script_embedding_idx"        ON "Script"        USING hnsw ("embedding" vector_cosine_ops);
> ```
> Apply as raw SQL (Prisma can't model indexes on `Unsupported()` columns, so they're not in the migration).

- [x] Schema synced — squashed baseline migration committed + validated; `migrate deploy` works on a fresh DB.

---

## ⚠️ Gate 4 — Lock down the data ports (SECURITY — do not skip)

`infra/docker-compose.yml` publishes **postgres (5432), redis (6379), kafka (9092/9094),
minio (9000/9001), clickhouse (8123)** on `0.0.0.0`. On a public-IP VPS that exposes your
database + an unauthenticated Redis to the internet. Before/while deploying:

- Firewall everything except the app ports. With `ufw`:
  ```bash
  ufw allow 22/tcp          # ssh
  ufw allow 3000/tcp        # web
  ufw allow 3001/tcp        # api
  ufw --force enable        # blocks 5432/6379/9000/8123/... from outside; containers still talk internally
  ```
- Or edit the compose to bind data services to `127.0.0.1:` only (e.g. `"127.0.0.1:5432:5432"`).
- Set strong `POSTGRES_PASSWORD` / `MINIO_ROOT_PASSWORD` in `infra/.env` (never the defaults).

- [ ] Firewall up: only 22/3000/3001 reachable from outside.
- [ ] Strong DB/MinIO passwords set.

---

## After the gates

Push to `main` → CI (green) → Deploy SSHes in, `git reset --hard origin/main`, runs
`scripts/deploy.sh` → `docker compose up -d --build` (rebuilds changed app images, runs
`migrate`, starts everything). Reach:
- **Web:** `http://188.94.191.142:3000`
- **API:** `http://188.94.191.142:3001` (Swagger at `/docs`)

To deploy manually without CI: `ssh root@188.94.191.142 'cd /opt/contento && git pull && bash scripts/deploy.sh'`.

> **video-worker (heavy render/stitch, Plan B/B2) is now wired but gated behind the `video` profile.**
> The Dockerfile has a `video-runner` stage (base runner + `apk add ffmpeg`, since `stitch.ts` shells
> out to `ffmpeg`/`ffprobe`) and `infra/docker-compose.yml` has a `video-worker` service under
> `profiles: [video]`. The **default deploy does NOT build it**, so an unvalidated image can't block
> web/api. Its image build is **not yet validated** (no Docker was available when it was added) — the
> main risk is Remotion's chrome-headless-shell on Alpine (same base as the already-deployed
> render-worker, so precedented). Validate + run it once Docker is up:
> ```bash
> docker compose -f infra/docker-compose.yml --profile video build video-worker   # validate the image
> docker compose -f infra/docker-compose.yml --profile video up -d video-worker    # then run it
> ```
> The render-worker (PNG visuals) IS in the default deploy.

## Links
| What | Link |
|------|------|
| Repo (CI/CD) | https://github.com/c01der-js/contento |
| GitHub Actions secrets | https://github.com/c01der-js/contento/settings/secrets/actions |
| Web (after deploy) | http://188.94.191.142:3000 |
| API (after deploy) | http://188.94.191.142:3001/docs |
