-- AlterEnum: add FILTERED to TrendStatus
ALTER TYPE "TrendStatus" ADD VALUE 'FILTERED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TrendLifecycle" AS ENUM ('RISING', 'PEAK', 'DECLINING', 'FLAT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TrendFeedbackSignal" AS ENUM ('INTERESTING', 'NOT_RELEVANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('TREND_DIGEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add lifecycle and velocityScoreHistory to Trend
ALTER TABLE "Trend"
  ADD COLUMN "lifecycle" "TrendLifecycle",
  ADD COLUMN "velocityScoreHistory" JSONB;

-- CreateTable: TabooTopic
CREATE TABLE "TabooTopic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TabooTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TrendFeedback
CREATE TABLE "TrendFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "trendId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" "TrendFeedbackSignal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrendFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TabooTopic_workspaceId_topic_key" ON "TabooTopic"("workspaceId", "topic");
CREATE INDEX "TabooTopic_workspaceId_idx" ON "TabooTopic"("workspaceId");

CREATE UNIQUE INDEX "TrendFeedback_trendId_userId_key" ON "TrendFeedback"("trendId", "userId");
CREATE INDEX "TrendFeedback_workspaceId_idx" ON "TrendFeedback"("workspaceId");
CREATE INDEX "TrendFeedback_trendId_idx" ON "TrendFeedback"("trendId");

CREATE INDEX "Notification_workspaceId_userId_idx" ON "Notification"("workspaceId", "userId");
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "TabooTopic" ADD CONSTRAINT "TabooTopic_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrendFeedback" ADD CONSTRAINT "TrendFeedback_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrendFeedback" ADD CONSTRAINT "TrendFeedback_trendId_fkey"
  FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
