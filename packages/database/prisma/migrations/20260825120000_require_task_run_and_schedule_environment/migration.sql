-- Backfill rows created while environmentId was nullable.
UPDATE "TaskRun" AS run
SET "environmentId" = task."environmentId"
FROM "Task" AS task
WHERE run."taskId" = task.id
  AND run."environmentId" IS NULL;

UPDATE "TaskSchedule" AS schedule
SET "environmentId" = task."environmentId"
FROM "Task" AS task
WHERE schedule."taskId" = task.id
  AND schedule."environmentId" IS NULL;

-- Fail safely instead of silently making tenant-scoped records inaccessible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TaskRun" WHERE "environmentId" IS NULL) THEN
    RAISE EXCEPTION 'TaskRun.environmentId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "TaskSchedule" WHERE "environmentId" IS NULL) THEN
    RAISE EXCEPTION 'TaskSchedule.environmentId backfill failed';
  END IF;
END $$;

ALTER TABLE "TaskRun" ALTER COLUMN "environmentId" SET NOT NULL;
ALTER TABLE "TaskSchedule" ALTER COLUMN "environmentId" SET NOT NULL;
