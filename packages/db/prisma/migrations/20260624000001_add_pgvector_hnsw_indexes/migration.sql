-- pgvector HNSW indexes for the embedding similarity search used by the feedback loop
-- (GoldenExample retrieval) and the "similar scripts" library feature (Script).
--
-- Prisma cannot model indexes on Unsupported("vector(1536)") columns, so they are created
-- here as raw SQL. Opclass is vector_cosine_ops because both searches use the cosine
-- distance operator `<=>` (see packages/ai/src/golden-examples.ts: `1 - (embedding <=> ...)`).
--
-- NON-concurrent on purpose: Prisma wraps each migration in a single transaction, and
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. At beta scale the tables
-- are tiny (≪10k vectors) so the brief write lock is negligible. If/when volume grows, drop
-- and rebuild these out-of-band with CONCURRENTLY during a maintenance window.
CREATE INDEX IF NOT EXISTS "GoldenExample_embedding_idx"
  ON "GoldenExample" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "Script_embedding_idx"
  ON "Script" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
