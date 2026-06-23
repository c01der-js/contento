-- Add a persisted post URL on Publication (previously only emitted in the Kafka
-- publish.completed event; platformPostId alone was stored). Additive, nullable.
ALTER TABLE "Publication" ADD COLUMN "postUrl" TEXT;
