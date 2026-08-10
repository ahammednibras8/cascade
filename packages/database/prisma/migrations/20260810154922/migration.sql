-- DropIndex
DROP INDEX "TaskEvent_taskRunId_createdAt_idx";

-- CreateIndex
CREATE INDEX "TaskEvent_taskRunId_createdAt_id_idx" ON "TaskEvent"("taskRunId", "createdAt", "id");
