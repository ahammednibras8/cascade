-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "delayUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TaskRun_status_delayUntil_idx" ON "TaskRun"("status", "delayUntil");
