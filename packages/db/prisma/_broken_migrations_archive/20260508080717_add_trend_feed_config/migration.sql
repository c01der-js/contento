-- CreateTable
CREATE TABLE "TrendFeedConfig" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendFeedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendFeedConfig_enabled_idx" ON "TrendFeedConfig"("enabled");
