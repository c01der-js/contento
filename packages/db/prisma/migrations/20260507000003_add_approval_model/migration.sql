-- packages/db/prisma/migrations/20260507000003_add_approval_model/migration.sql
ALTER TABLE "Script" ADD COLUMN "submittedById" TEXT;

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Approval_scriptId_idx" ON "Approval"("scriptId");

ALTER TABLE "Approval" ADD CONSTRAINT "Approval_scriptId_fkey"
    FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
