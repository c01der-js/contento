ALTER TABLE "Trend" ADD COLUMN "relevanceScore" INTEGER;
ALTER TABLE "Trend" ADD COLUMN "category" TEXT;
ALTER TABLE "Trend" ADD COLUMN "sourceMetadata" JSONB;
ALTER TABLE "Trend" ADD COLUMN "discoveredAt" TIMESTAMP(3);

ALTER TYPE "ScriptStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "ScriptStatus" ADD VALUE 'REJECTED';

CREATE INDEX "Trend_workspaceId_relevanceScore_idx" ON "Trend"("workspaceId", "relevanceScore");
