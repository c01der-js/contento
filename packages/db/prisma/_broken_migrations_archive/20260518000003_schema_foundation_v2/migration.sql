-- CreateEnum
CREATE TYPE "IdeaGoal" AS ENUM ('SALE', 'REACH', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('BROLL', 'PRODUCT', 'REFERENCE', 'VOICE_SAMPLE');

-- AlterEnum: NotificationChannelType (rename values)
ALTER TYPE "NotificationChannelType" RENAME VALUE 'in_app' TO 'IN_APP';
ALTER TYPE "NotificationChannelType" RENAME VALUE 'email' TO 'EMAIL';
ALTER TYPE "NotificationChannelType" RENAME VALUE 'telegram' TO 'TELEGRAM';
ALTER TYPE "NotificationChannelType" RENAME VALUE 'slack' TO 'SLACK';

-- AlterTable: BrandTone - add extended fields
ALTER TABLE "BrandTone"
  ADD COLUMN IF NOT EXISTS "adjectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "examplesPositive" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "examplesNegative" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "manifesto" TEXT;

-- AlterTable: VisualIdentity - add logo variants
ALTER TABLE "VisualIdentity"
  ADD COLUMN IF NOT EXISTS "logoFullUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "logoIconUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "logoLightUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "logoDarkUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "graphicElements" JSONB;

-- AlterTable: Script - add content fields and embedding
ALTER TABLE "Script"
  ADD COLUMN IF NOT EXISTS "captions" JSONB,
  ADD COLUMN IF NOT EXISTS "coverConcept" JSONB,
  ADD COLUMN IF NOT EXISTS "storyboard" JSONB,
  ADD COLUMN IF NOT EXISTS "musicSuggestion" JSONB,
  ADD COLUMN IF NOT EXISTS "subtitles" JSONB,
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- AlterTable: Idea - add goal and pillar fields
ALTER TABLE "Idea"
  ADD COLUMN IF NOT EXISTS "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "goal" "IdeaGoal",
  ADD COLUMN IF NOT EXISTS "pillarId" TEXT;

-- AlterTable: Publication - add rich publish fields
ALTER TABLE "Publication"
  ADD COLUMN IF NOT EXISTS "geotag" JSONB,
  ADD COLUMN IF NOT EXISTS "taggedAccounts" JSONB,
  ADD COLUMN IF NOT EXISTS "collaborators" JSONB,
  ADD COLUMN IF NOT EXISTS "firstComment" TEXT,
  ADD COLUMN IF NOT EXISTS "metrics" JSONB;

-- AlterTable: TabooTopic - add reason
ALTER TABLE "TabooTopic"
  ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- AlterTable: AntiExample - add format and platform
ALTER TABLE "AntiExample"
  ADD COLUMN IF NOT EXISTS "format" TEXT,
  ADD COLUMN IF NOT EXISTS "platform" TEXT;

-- CreateTable: Integration
CREATE TABLE IF NOT EXISTS "Integration" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Asset
CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "kind" "AssetKind" NOT NULL,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "mimeType" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Goal
CREATE TABLE IF NOT EXISTS "Goal" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "type" "GoalType" NOT NULL,
  "targetValue" INTEGER,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "deadline" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AntiExample
CREATE TABLE IF NOT EXISTS "AntiExample" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "format" TEXT,
  "platform" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AntiExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SocialAccountSnapshot
CREATE TABLE IF NOT EXISTS "SocialAccountSnapshot" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "socialAccountId" TEXT NOT NULL,
  "followerCount" INTEGER NOT NULL,
  "followingCount" INTEGER,
  "date" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Integration_workspaceId_idx" ON "Integration"("workspaceId");
CREATE INDEX IF NOT EXISTS "Integration_workspaceId_type_idx" ON "Integration"("workspaceId", "type");
CREATE INDEX IF NOT EXISTS "Asset_workspaceId_idx" ON "Asset"("workspaceId");
CREATE INDEX IF NOT EXISTS "Asset_workspaceId_kind_idx" ON "Asset"("workspaceId", "kind");
CREATE INDEX IF NOT EXISTS "Goal_workspaceId_idx" ON "Goal"("workspaceId");
CREATE INDEX IF NOT EXISTS "AntiExample_workspaceId_idx" ON "AntiExample"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccountSnapshot_socialAccountId_date_key" ON "SocialAccountSnapshot"("socialAccountId", "date");
CREATE INDEX IF NOT EXISTS "SocialAccountSnapshot_socialAccountId_idx" ON "SocialAccountSnapshot"("socialAccountId");
CREATE INDEX IF NOT EXISTS "SocialAccountSnapshot_socialAccountId_date_idx" ON "SocialAccountSnapshot"("socialAccountId", "date");
CREATE INDEX IF NOT EXISTS "Idea_pillarId_idx" ON "Idea"("pillarId");
CREATE INDEX IF NOT EXISTS "Script_embedding_idx" ON "Script" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AntiExample" ADD CONSTRAINT "AntiExample_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialAccountSnapshot" ADD CONSTRAINT "SocialAccountSnapshot_socialAccountId_fkey"
  FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Idea" ADD CONSTRAINT "Idea_pillarId_fkey"
  FOREIGN KEY ("pillarId") REFERENCES "BrandPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
