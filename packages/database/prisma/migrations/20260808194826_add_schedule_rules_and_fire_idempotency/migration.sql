-- CreateEnum
CREATE TYPE "TaskScheduleType" AS ENUM ('INTERVAL', 'CRON');

-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TaskSchedule"
ADD COLUMN "scheduleType" "TaskScheduleType" NOT NULL DEFAULT 'INTERVAL',
ADD COLUMN "cronExpression" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_scheduleId_scheduledFor_key" ON "TaskRun"("scheduleId", "scheduledFor");
