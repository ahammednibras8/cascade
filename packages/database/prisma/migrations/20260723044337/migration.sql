-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "scheduleId" UUID;

-- CreateTable
CREATE TABLE "TaskSchedule" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB,
    "intervalSeconds" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSchedule_taskId_idx" ON "TaskSchedule"("taskId");

-- CreateIndex
CREATE INDEX "TaskSchedule_enabled_nextRunAt_idx" ON "TaskSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "TaskSchedule_lockedAt_idx" ON "TaskSchedule"("lockedAt");

-- CreateIndex
CREATE INDEX "TaskRun_scheduleId_createdAt_idx" ON "TaskRun"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TaskSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
