-- DropIndex
DROP INDEX "ApiKey_environmentId_idx";

-- DropIndex
DROP INDEX "TaskSchedule_enabled_nextRunAt_idx";

-- DropIndex
DROP INDEX "TaskSchedule_taskId_idx";

-- CreateIndex
CREATE INDEX "ApiKey_environmentId_createdAt_id_idx" ON "ApiKey"("environmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ApiKey_environmentId_revokedAt_createdAt_id_idx" ON "ApiKey"("environmentId", "revokedAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Deployment_environmentId_createdAt_id_idx" ON "Deployment"("environmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Task_environmentId_deploymentId_slug_id_idx" ON "Task"("environmentId", "deploymentId", "slug", "id");

-- CreateIndex
CREATE INDEX "TaskSchedule_taskId_nextRunAt_id_idx" ON "TaskSchedule"("taskId", "nextRunAt", "id");

-- CreateIndex
CREATE INDEX "TaskSchedule_enabled_nextRunAt_id_idx" ON "TaskSchedule"("enabled", "nextRunAt", "id");
