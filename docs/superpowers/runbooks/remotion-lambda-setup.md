# Remotion Lambda — setup runbook (clearing the blockers)

Step-by-step setup so that, when render volume justifies it, activating Lambda is `VIDEO_STITCHER=lambda` + paste-the-env, with **zero remaining blockers**. Companion to `docs/superpowers/plans/2026-06-19-remotion-lambda.md` (the code design). Do these in order; each section ends with a checklist.

> **TL;DR of the three gates:** (1) buy a Remotion Company License, (2) create an AWS account + IAM user with the Remotion policy, (3) move shot media to AWS-reachable S3/CDN. Then run the deploy script and flip the flag.

---

## 0. Why these steps exist

Lambda renders run **inside AWS**. Two things must be true that aren't today:
- Remotion Lambda is **license-gated** for commercial use (4+ employees) — legal/cost gate.
- The render's Chromium fetches every `<OffthreadVideo src>` / `<Audio src>` **over the public internet**. Our clips currently sit in **private MinIO at `localhost:9000`**, which AWS cannot reach. They must move to real S3 (or a public CDN).

Everything below removes those gates.

---

## 1. Remotion Company License (gate #1)

Remotion is source-available but **not** free for for-profit companies with 4+ people, and **Remotion Lambda specifically requires a paid license** regardless.

1. Go to the Remotion licensing platform: **https://www.remotion.pro/** (Remotion's commercial licensing — "Company License").
2. Docs / Lambda overview: **https://www.remotion.dev/docs/lambda**. Licensing details: **https://www.remotion.dev/docs/license**.
3. Buy seats for the number of developers (~$25/dev/month, ~$100/month minimum at the time of writing — verify current pricing on the site).
4. Keep the license confirmation; there is no license key to paste into code, but you must hold a valid license to run Lambda commercially.

- [ ] Company License purchased and active.

---

## 2. AWS account + IAM for Remotion Lambda (gate #2)

1. **AWS account.** Create/sign in at **https://console.aws.amazon.com/**. Pick a home region (e.g. `us-east-1` or `eu-central-1`) — the same region must be used everywhere below and in `REMOTION_AWS_REGION`.

2. **IAM user for Remotion.** Remotion ships a policy generator so you don't hand-craft permissions:
   ```bash
   # from the repo, after Lambda dep is installed (plan Task 1):
   npx remotion lambda policies user      # prints the IAM user policy JSON
   npx remotion lambda policies role       # prints the Lambda execution-role policy JSON
   ```
   - In the AWS console → IAM → Users → create a user `contento-remotion`, attach a new policy pasted from `policies user`.
   - Create an access key for that user → you get `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.
   - Remotion auto-creates its execution role on first `deployFunction`; the `policies role` output is for reference / locked-down setups.
   - Full IAM walkthrough: **https://www.remotion.dev/docs/lambda/setup**.

3. **Validate** (after the dep is installed):
   ```bash
   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
     npx remotion lambda policies validate
   ```
   It checks the credentials have exactly the permissions Remotion needs.

- [ ] AWS account created, home region chosen.
- [ ] IAM user `contento-remotion` with the Remotion policy; access key issued.
- [ ] `npx remotion lambda policies validate` passes.

---

## 3. AWS-reachable shot media (gate #3 — the real blocker)

The render's input clips/audio must be fetchable from AWS. Two options:

### Option A (recommended): make the render bucket real S3
Move the media bucket the video-worker writes to (clips at `videos/shots/...`, audio `.mp3`, the stitched output) from MinIO to **AWS S3** in the same region.
- Point the worker's S3 env at AWS S3 instead of MinIO:
  ```
  S3_ENDPOINT=                       # leave empty → AWS S3 default endpoint (not http://localhost:9000)
  S3_BUCKET=contento-media           # a real S3 bucket you create in the Lambda region
  S3_ACCESS_KEY=<aws key>            # the code reads S3_ACCESS_KEY / S3_SECRET_KEY (see s3-client.ts)
  S3_SECRET_KEY=<aws secret>
  ```
  (Note: `apps/video-worker/src/s3-client.ts` reads `S3_ACCESS_KEY`/`S3_SECRET_KEY` and `S3_ENDPOINT`/`S3_BUCKET`. With a real S3 endpoint, `presignGetUrl` produces AWS-resolvable URLs and `isOwnS3Url` still matches so clips get presigned.)
- The bucket can stay **private** — Remotion fetches via the **presigned** URLs the worker already generates. Just ensure the presign host is the AWS S3 host, not `localhost`.

### Option B: public CDN in front of MinIO
Keep MinIO but expose the media bucket through a public, internet-reachable CDN/proxy with a stable domain, and make `presignGetUrl` (or a CDN-URL rewrite) emit those public URLs. More moving parts; only worth it if MinIO must stay authoritative.

### Presign TTL
A Lambda render fans out across many invocations + cold starts and can take minutes. Raise the presign lifetime above the worst case:
- `apps/video-worker/src/s3-client.ts` → `presignGetUrl(key, expiresInSec = 3600)`; the `handleStitch` callers use the default 3600s (1h). 1h is usually plenty, but if you see input-fetch 403s in CloudWatch (expired URL), bump it (e.g. 7200).

- [ ] Media bucket is AWS-reachable S3 (Option A) **or** public CDN (Option B).
- [ ] Presigned clip/audio URLs resolve from outside your network (test: `curl` a presigned URL from a non-local machine).
- [ ] Presign TTL comfortably exceeds Lambda render time.

> This media move overlaps the deferred **deploy-phase storage work** and the **SQL-migration** debt — sequence them together when you stand up the real backend. See `[[contento-known-issues]]`.

---

## 4. Deploy the Remotion Lambda function + site

After the plan's Tasks 1–5 are merged (the `@remotion/lambda` dep, `renderStitchOnLambda`, the flag branch, `scripts/deploy-lambda.ts`, env docs):

```bash
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  REMOTION_AWS_REGION=us-east-1 \
  pnpm --filter @contento/video-worker exec tsx scripts/deploy-lambda.ts
```
It prints:
```
REMOTION_LAMBDA_FUNCTION=remotion-render-4-0-468-mem3008-disk10240-240sec
REMOTION_SERVE_URL=https://s3.<region>.amazonaws.com/<bucket>/sites/contento-videostitch/index.html
REMOTION_AWS_REGION=us-east-1
```
Paste those three into the worker env (and `infra/.env` for the deployed worker).

Re-run this script whenever the `@contento/brand-kit` compositions change (it re-uploads the site) or when Remotion is upgraded (the function is version-pinned to 4.0.468 — a Remotion bump means: update all `@remotion/*` to the new version together, then re-deploy).

- [ ] `deploy-lambda.ts` run; function + site names captured.
- [ ] `REMOTION_LAMBDA_FUNCTION` / `REMOTION_SERVE_URL` / `REMOTION_AWS_REGION` set in the worker env.

---

## 5. Activate + verify

1. Set `VIDEO_STITCHER=lambda` in the video-worker env.
2. Run one real campaign video end-to-end (a script → VideoJob → stitch).
3. Confirm `VideoJob.outputUrl` is a valid MP4 and the job is `DONE`.
4. Watch **CloudWatch Logs** for the Remotion function:
   - `403`/timeout on an input fetch → gate #3 not cleared (media not reachable / presign expired).
   - `fatalErrorEncountered` → check the Remotion error message in the render progress.
5. **Cost/limits:** confirm Lambda concurrency limits and per-render cost are acceptable at your volume before making `lambda` the default. Keep `VIDEO_STITCHER=remotion` as the instant rollback.

- [ ] One real video rendered on Lambda end-to-end, `outputUrl` valid.
- [ ] CloudWatch clean (no input-fetch errors).
- [ ] Cost/concurrency reviewed; rollback path (`=remotion`) confirmed.

---

## 6. Rollback

`VIDEO_STITCHER=remotion` (local Chromium render) or `=ffmpeg` (legacy concat). No code change, no redeploy — the local paths are always present and are the default. The Lambda code is dormant unless the flag is `lambda`.

---

## Quick reference — links

| What | Link |
|------|------|
| Remotion docs (Lambda) | https://www.remotion.dev/docs/lambda |
| Remotion Lambda setup (IAM walkthrough) | https://www.remotion.dev/docs/lambda/setup |
| Remotion licensing (Company License) | https://www.remotion.pro/ |
| Remotion license terms | https://www.remotion.dev/docs/license |
| AWS Console | https://console.aws.amazon.com/ |
| This repo (code) | https://github.com/c01der-js/contento |

> Verify Remotion pricing/policy pages directly — terms and prices change. The exact `@remotion/lambda` 4.0.468 CLI/SDK option names should be checked against the installed package types when running the deploy.
