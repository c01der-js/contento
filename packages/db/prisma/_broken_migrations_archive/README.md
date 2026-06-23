# Archived migrations (pre-squash, broken history)

These are the 18 original migrations (`20250507000000_init` … `20260526000000_add_video_job_language`).
They are **kept for reference only** — Prisma reads exclusively from `../migrations/`, so nothing here runs.

## Why they were archived

The history was **not replayable from scratch**: `20250507120000_add_scheduled_at_to_publication`
re-adds `Publication.scheduledAt`, which `20250507000000_init` already creates. A fresh
`prisma migrate deploy` (what the compose `migrate` service runs) therefore failed at the 2nd
migration:

```
ERROR: column "scheduledAt" of relation "Publication" already exists  (SQLSTATE 42701)
```

This was the result of the schema being driven by `db:push` for a long stretch while migrations
were only intermittently generated — the two drifted apart.

## What replaced them

A single squashed baseline: `../migrations/20260623000000_baseline_squash/migration.sql`,
generated with `prisma migrate diff --from-empty --to-schema-datamodel` and validated to apply
cleanly on a fresh DB with **zero drift** against `schema.prisma`. Because no production database
had ever applied the old history (the server DB is fresh), squashing is safe.

## If you ever need the old SQL

It's all here, and in git history. Do **not** move these back under `../migrations/` — that
re-introduces the broken replay.
