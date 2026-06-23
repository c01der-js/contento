-- CreateEnum
CREATE TYPE "AbTestKind" AS ENUM ('TEXT', 'COVER');

-- CreateEnum
CREATE TYPE "LengthVariant" AS ENUM ('SHORT', 'LONG');

-- AlterTable: Script — make ideaId nullable and add variant fields
ALTER TABLE "Script"
  ALTER COLUMN "ideaId" DROP NOT NULL,
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lengthVariant" "LengthVariant",
  ADD COLUMN "hasTts" BOOLEAN;

-- Drop old non-null unique index on ideaId and recreate as partial (only for non-null values)
DROP INDEX IF EXISTS "Script_ideaId_key";
CREATE UNIQUE INDEX "Script_ideaId_key" ON "Script"("ideaId") WHERE "ideaId" IS NOT NULL;

-- AlterTable: AbTest — add kind field
ALTER TABLE "AbTest"
  ADD COLUMN "kind" "AbTestKind" NOT NULL DEFAULT 'TEXT';

-- AlterTable: AbVariant — add coverConcept field
ALTER TABLE "AbVariant"
  ADD COLUMN "coverConcept" JSONB;

-- CreateIndex
CREATE INDEX "Script_parentId_idx" ON "Script"("parentId");

-- AddForeignKey: Script.parentId -> Script.id
ALTER TABLE "Script"
  ADD CONSTRAINT "Script_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Script"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
