-- Per-workspace, per-platform overrides for the static platform profiles. Absent row = default.
CREATE TABLE "PlatformProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "targetDurationMinSec" INTEGER NOT NULL,
    "targetDurationIdealSec" INTEGER NOT NULL,
    "targetDurationMaxSec" INTEGER NOT NULL,
    "hookWindowSec" INTEGER NOT NULL,
    "captionStyle" TEXT NOT NULL,
    "hashtagCount" INTEGER NOT NULL,
    "captionMaxLen" INTEGER NOT NULL,
    "nativeSoundImportance" TEXT NOT NULL,
    "formatAvatar" DOUBLE PRECISION NOT NULL,
    "formatBroll" DOUBLE PRECISION NOT NULL,
    "formatScreencast" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformProfile_workspaceId_idx" ON "PlatformProfile"("workspaceId");

CREATE UNIQUE INDEX "PlatformProfile_workspaceId_platform_key" ON "PlatformProfile"("workspaceId", "platform");

ALTER TABLE "PlatformProfile" ADD CONSTRAINT "PlatformProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
