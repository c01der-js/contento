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

## Gate 3 — Database schema (the runtime blocker)

This session built features behind schema changes (`PublicationMetric`, `QaCheck`,
`Campaign.targetPlatforms`, `VideoShot.shotType/headline/audioUrl/screencast*`,
`Publication.videoJobId/metricsHistory`, `GoldenExample.sourceScriptId/promotedAt`,
`AssetKind.SCREENCAST`, …) but the schema has been on `db:push` since the initial commit —
**no SQL migrations exist** for any of it (last committed: `20260526000000_add_video_job_language`).
The compose `migrate` service runs `prisma migrate deploy`, which only applies **committed**
migrations → the new columns/tables won't be created → the API crashes at runtime.

Pick one:

**(A) Generate migrations (proper for prod):** from a machine with a reachable Postgres,
```bash
pnpm --filter @contento/db run db:migrate    # prisma migrate dev — emits SQL for the drift
git add packages/db/prisma/migrations && git commit -m "feat(db): generate SQL migrations for the schema drift"
```
then push — the compose `migrate` step applies them. Add the pgvector index by hand to the migration SQL:
```sql
CREATE INDEX IF NOT EXISTS golden_example_embedding_idx
  ON "GoldenExample" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**(B) `db push` once on the server (fast, pre-prod — matches how dev works):**
```bash
cd /opt/contento
docker compose -f infra/docker-compose.yml up -d postgres
docker compose -f infra/docker-compose.yml run --rm \
  -e DATABASE_URL="postgresql://<user>:<pass>@postgres:5432/<db>" \
  migrate sh -c "pnpm --filter @contento/db exec prisma db push"
```
`db push` syncs the schema without migration files. Acceptable while iterating; switch to (A) before real production data.

- [ ] Schema synced (migrations generated+applied, or `db push` run once).

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

> **video-worker is NOT in `infra/docker-compose.yml` or the Dockerfile's build list** — the heavy
> video render/stitch (Plan B/B2) doesn't deploy yet. Add a service + extend the Dockerfile copy
> list when that path goes live. The render-worker (PNG visuals) IS deployed.

## Links
| What | Link |
|------|------|
| Repo (CI/CD) | https://github.com/c01der-js/contento |
| GitHub Actions secrets | https://github.com/c01der-js/contento/settings/secrets/actions |
| Web (after deploy) | http://188.94.191.142:3000 |
| API (after deploy) | http://188.94.191.142:3001/docs |
