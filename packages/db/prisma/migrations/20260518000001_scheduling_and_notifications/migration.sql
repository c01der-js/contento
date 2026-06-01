-- Add new NotificationType values
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_FAILURE';

-- Add new fields to Notification: entityType, entityId, read (boolean alias via readAt)
-- The spec says `read Boolean` — we implement via readAt IS NULL check on query side.
-- entityType and entityId are optional metadata columns.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityId" TEXT;

-- Add scheduling-enhancement fields to Publication
ALTER TABLE "Publication" ADD COLUMN IF NOT EXISTS "geotag" JSONB;
ALTER TABLE "Publication" ADD COLUMN IF NOT EXISTS "taggedAccounts" JSONB;
ALTER TABLE "Publication" ADD COLUMN IF NOT EXISTS "collaborators" JSONB;
ALTER TABLE "Publication" ADD COLUMN IF NOT EXISTS "firstComment" TEXT;
