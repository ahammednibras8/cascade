-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "environmentId" UUID;

-- AlterTable
ALTER TABLE "TaskSchedule" ADD COLUMN     "environmentId" UUID;

-- CreateIndex
CREATE INDEX "TaskRun_environmentId_createdAt_id_idx" ON "TaskRun"("environmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TaskRun_environmentId_status_createdAt_id_idx" ON "TaskRun"("environmentId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TaskSchedule_environmentId_nextRunAt_id_idx" ON "TaskSchedule"("environmentId", "nextRunAt", "id");

-- CreateIndex
CREATE INDEX "TaskSchedule_environmentId_enabled_nextRunAt_id_idx" ON "TaskSchedule"("environmentId", "enabled", "nextRunAt", "id");

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
