# Reconciled roadmap — office-hours report × session decisions (2026-06-15)

Two strategy artifacts landed the same day and **partially contradict**. This doc reconciles them, records the report's notes, retires already-done risks, and flags the open decision.

- **Office-hours report:** `~/.gstack/projects/Contento-main/office-hours-2026-06-15.md` (YC-style review, "Full agency mode").
- **Session work:** review verification (`2026-06-15-review-verification-and-plan.md`), P0 plan (`docs/superpowers/plans/2026-06-15-p0-video-publishing.md`), platform-strategy research (`2026-06-15-platform-strategy-and-decisions.md`).

## The office-hours thesis (what it adds)

**The wedge = a feedback loop that makes content smarter from performance data** ("I'd pay if it learned from what performed well"). This is the differentiator and the report puts it in **month 1, not month 6**. V1 sequence:
1. **QA gate** (week 1–2) — auto pre-approval check (lip-sync confidence, subtitle completeness, duration vs target, clipping). `PASS/WARN/BLOCK`. New `QaCheck` model + pre-approval hook. Even a stub returning `WARN` ships the infrastructure.
2. **Distribution confirmation** (week 1–2) — run a real video end-to-end to a real account; ≥2 platforms return a real `publication_url`. (≈ our P0.)
3. **PostAnalytics** (week 2–4) — new `PublicationMetric` model (views/likes/comments/watch_time/reach per platform/day); 24h BullMQ poll.
4. **Feedback loop v1** (week 4–6) — top-performing scripts become golden examples weighted into idea/script generation via pgvector similarity; needs **20+ published videos** for meaningful signal.
5. **VideoProvider abstraction** (week 6–7) — reduce Higgsfield lock-in (≈ our P0 Task 10).
6. **Platform presets** (week 7–8) — replace hardcoded 9:16 with a preset table (lighter than our PlatformProfile fan-out).

**Not in V1 (report):** partial shot regen, music, Instagram Insights, TikTok API, **multi-format (b-roll/text/screencast)**, paying for the Remotion commercial license (keep the `VIDEO_STITCHER` flag, don't remove).

## Conflicts to resolve (BLOCKING — user decision)

| Axis | Office-hours report | Session decisions (this turn) |
|------|--------------------|-------------------------------|
| **Market** | mid-size **mainland-RU** brands | **diaspora + CIS** |
| **VK** | **keep — VK is the FIRST publish+metrics target** (only accessible early metrics) | **removed entirely** |
| **Platform set** | TG, VK, IG, TikTok (no YouTube) | TikTok, IG Reels, YouTube Shorts, Telegram (no VK) |
| **Multi-format** | **Not in V1** (later) | approved as Plan B (also "later") |
| **Render** | defer Remotion license; keep flag | chose **Remotion Lambda** (needs the license) |
| **Feedback loop** | **THE wedge, month 1** | not yet in any plan |

The sharpest is **Market + VK**: the report's whole early feedback loop depends on VK because VK `wall.getStats` is the only metrics source available without an app audit (TG Bot API hides views → needs MTProto or VK-only; IG/TikTok analytics need Business + app review). Removing VK + going diaspora/CIS means the **early feedback-loop data source changes** (you'd lean on whatever metrics TikTok/IG expose, which are app-audit-gated). These cannot both be true — pick the market.

## Retired / corrected risks (don't redo)

- ✅ **pgvector** — already in `infra/docker-compose.yml` (`pgvector/pgvector:pg16`), schema declares `extensions = [pgvector(map:"vector")]`, and `Script.embedding vector(1536)` **already exists** (schema.prisma:407). The report's "check docker / add migration" is largely done; the feedback loop's embedding column is partly scaffolded.
- ✅ **Higgsfield retry backoff** — already implemented in Phase 0 (`packages/ai/src/higgsfield/client.ts` via `withRetry`/`HttpStatusError`). Report Risk 3 retired.
- ⚠️ **Telegram views** — confirmed constraint: Bot API doesn't expose views. First feedback loop runs on whatever platform DOES expose metrics. If mainland-RU+VK: VK `wall.getStats`. If diaspora/CIS: needs app-audit-gated IG/TikTok insights → feedback loop slips.
- 🔲 **New models needed:** `QaCheck`, `PublicationMetric` (confirmed absent). `Script.embedding` exists; may need `Script.performanceTier` enum.

## Reconciled near-term sequence (proposed, pending market decision)

The session P0 plan ≈ the report's "distribution confirmation," and our P0 Task 10 = the report's "VideoProvider." So they merge cleanly EXCEPT for VK/market. Proposed order, deferring multi-format Plan A/B behind the wedge (per office-hours):

1. **P0 — video reaches publication** (existing `2026-06-15-p0-video-publishing.md`), adjusted for the chosen platform set. Includes VideoProvider (Task 10).
2. **QA gate** (new — office-hours #1): `QaCheck` model + pre-approval hook + UI badge; stub-then-real.
3. **PostAnalytics** (`PublicationMetric` + 24h poll) on whatever platform exposes metrics for the chosen market.
4. **Feedback loop v1** (golden examples weighted into idea/script via pgvector — `Script.embedding` already exists).
5. **PlatformProfile (Plan A)** then **multi-format (Plan B)** — the per-platform/format work, after the wedge is proven. (Confirmed design: 2 plans A→B; target platforms at Campaign level; screencast = Remotion-synthetic + optional uploaded recording.)
6. **Remotion Lambda** + license — when render volume justifies it.

This makes the **feedback loop the spine** (per office-hours) while keeping the approved multi-format work as the differentiation layer on top.

## Open question
**Which market — mainland-RU (keep VK, VK-first metrics) or diaspora+CIS (no VK, metrics gated)?** Everything downstream (platform set, the feedback loop's data source, VK removal) hangs on this.
