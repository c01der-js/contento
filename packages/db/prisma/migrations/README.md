# Migrations

Migrations are generated with `prisma migrate dev` and applied with `prisma migrate deploy`
(the deploy path runs as the compose `migrate` one-shot). Run from the `packages/db` directory.

## History

- `20260623000000_baseline_squash` — single validated baseline (the prior 18-migration
  history was unreplayable due to db:push drift; the originals are archived under
  `_broken_migrations_archive/`, which Prisma ignores). **Do not** move them back.
- `20260624000000_add_publication_post_url` — adds `Publication.postUrl`.
- `20260624000001_add_pgvector_hnsw_indexes` — pgvector HNSW (cosine) indexes on the
  embedding columns. See below.

## pgvector HNSW indexes (now applied automatically)

Embedding similarity search (feedback-loop GoldenExample retrieval + the "similar scripts"
library feature) needs HNSW indexes. Prisma cannot model indexes on `Unsupported("vector")`
columns, so they live as raw SQL in `20260624000001_add_pgvector_hnsw_indexes/migration.sql`,
applied automatically by `migrate deploy`. They cover **both** `GoldenExample.embedding` and
`Script.embedding`, with opclass `vector_cosine_ops` (both searches use the cosine operator
`<=>`).

Note: the migration creates the indexes **without** `CONCURRENTLY`. Prisma wraps each
migration in a single transaction and `CREATE INDEX CONCURRENTLY` cannot run inside one. At
beta scale (≪10k vectors) the brief write lock is negligible. If volume grows, drop and
rebuild the indexes out-of-band with `CONCURRENTLY` during a maintenance window. `m = 16,
ef_construction = 64` are sensible defaults for < 100k rows.
