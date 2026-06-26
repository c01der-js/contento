-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('NEW', 'USED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "storyId" TEXT;

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawText" TEXT NOT NULL,
    "status" "StoryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_workspaceId_status_idx" ON "Story"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Story_workspaceId_createdAt_idx" ON "Story"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Script_storyId_idx" ON "Script"("storyId");

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
