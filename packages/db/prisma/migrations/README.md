# Migrations

Migrations are generated with `prisma migrate dev`. Run from the `packages/db` directory.

## Manual SQL required after initial migration

After the first migration (which creates the `GoldenExample` table), add the pgvector
HNSW index for embedding similarity search. Prisma cannot generate this automatically
because it uses the `Unsupported` type.

```sql
-- Add HNSW index for cosine similarity search on GoldenExample embeddings
-- Run once after the initial migration that creates the GoldenExample table
CREATE INDEX CONCURRENTLY IF NOT EXISTS golden_example_embedding_hnsw_idx
  ON "GoldenExample"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The `CONCURRENTLY` flag avoids locking the table during index creation in production.
`m = 16, ef_construction = 64` are sensible defaults for < 100k rows.
