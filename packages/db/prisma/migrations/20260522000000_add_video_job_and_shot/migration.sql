-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('PENDING', 'STORYBOARDING', 'RENDERING_SHOTS', 'STITCHING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoShotStatus" AS ENUM ('PENDING', 'SUBMITTED', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'PENDING',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoShot" (
    "id" TEXT NOT NULL,
    "videoJobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "dialogue" TEXT,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "status" "VideoShotStatus" NOT NULL DEFAULT 'PENDING',
    "higgsfieldJobId" TEXT,
    "clipUrl" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "VideoShot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_workspaceId_idx" ON "VideoJob"("workspaceId");

-- CreateIndex
CREATE INDEX "VideoJob_scriptId_idx" ON "VideoJob"("scriptId");

-- CreateIndex
CREATE INDEX "VideoShot_videoJobId_idx" ON "VideoShot"("videoJobId");

-- CreateIndex
CREATE INDEX "VideoShot_higgsfieldJobId_idx" ON "VideoShot"("higgsfieldJobId");

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoShot" ADD CONSTRAINT "VideoShot_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
