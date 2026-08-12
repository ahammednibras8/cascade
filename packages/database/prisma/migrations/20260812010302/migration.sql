-- DropIndex
DROP INDEX "RunEventOutbox_publishedAt_id_idx";

-- AlterTable
ALTER TABLE "RunEventOutbox" ADD COLUMN     "lockOwner" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RunEventOutbox_publishedAt_lockedAt_id_idx" ON "RunEventOutbox"("publishedAt", "lockedAt", "id");
