-- Add new NotificationType values
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_FAILURE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPROVAL_NEEDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT_MENTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GENERIC';

-- Add new MembershipRole values
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'AUTHOR';
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'DESIGNER';
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'CLIENT';

-- Create TaskStatus enum
DO $$ BEGIN
  CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create ActivityAction enum
DO $$ BEGIN
  CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create NotificationChannelType enum
DO $$ BEGIN
  CREATE TYPE "NotificationChannelType" AS ENUM ('in_app', 'email', 'telegram', 'slack');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add read column to Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "read" BOOLEAN NOT NULL DEFAULT false;

-- Create Project table
CREATE TABLE IF NOT EXISTS "Project" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Project_workspaceId_idx" ON "Project"("workspaceId");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create Task table
CREATE TABLE IF NOT EXISTS "Task" (
  "id"                TEXT NOT NULL,
  "workspaceId"       TEXT NOT NULL,
  "projectId"         TEXT,
  "assigneeId"        TEXT,
  "title"             TEXT NOT NULL,
  "description"       TEXT,
  "dueDate"           TIMESTAMP(3),
  "status"            "TaskStatus" NOT NULL DEFAULT 'TODO',
  "relatedEntityType" TEXT,
  "relatedEntityId"   TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Task_workspaceId_idx" ON "Task"("workspaceId");
CREATE INDEX IF NOT EXISTS "Task_workspaceId_assigneeId_idx" ON "Task"("workspaceId", "assigneeId");
CREATE INDEX IF NOT EXISTS "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create ActivityLog table
CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "actorId"     TEXT,
  "action"      "ActivityAction" NOT NULL,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "meta"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_createdAt_idx" ON "ActivityLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_entityType_entityId_idx" ON "ActivityLog"("workspaceId", "entityType", "entityId");

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create NotificationChannel table
CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "channel"   "NotificationChannelType" NOT NULL,
  "config"    JSONB NOT NULL DEFAULT '{}',
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationChannel_userId_channel_key" ON "NotificationChannel"("userId", "channel");
CREATE INDEX IF NOT EXISTS "NotificationChannel_userId_idx" ON "NotificationChannel"("userId");

ALTER TABLE "NotificationChannel"
  ADD CONSTRAINT "NotificationChannel_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create NotificationPreference table
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "channel"   "NotificationChannelType" NOT NULL,
  "eventType" TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_channel_eventType_key" ON "NotificationPreference"("userId", "channel", "eventType");
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
