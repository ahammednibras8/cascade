-- AlterTable
ALTER TABLE "TaskSchedule" ALTER COLUMN "intervalSeconds" DROP NOT NULL;

ALTER TABLE "TaskSchedule"
ADD CONSTRAINT "TaskSchedule_schedule_rule_check"
CHECK (
  (
    "scheduleType" = 'INTERVAL'
    AND "intervalSeconds" IS NOT NULL
    AND "cronExpression" IS NULL
  )
  OR
  (
    "scheduleType" = 'CRON'
    AND "intervalSeconds" IS NULL
    AND "cronExpression" IS NOT NULL
  )
);
