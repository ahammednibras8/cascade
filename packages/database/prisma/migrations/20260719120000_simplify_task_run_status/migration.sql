CREATE TYPE "TaskRunStatus_new" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED');

ALTER TABLE "TaskRun" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "TaskRun"
ALTER COLUMN "status" TYPE "TaskRunStatus_new"
USING (
  CASE "status"::text
    WHEN 'QUEUED' THEN 'PENDING'
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'RUNNING' THEN 'EXECUTING'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'CANCELED' THEN 'FAILED'
  END
)::"TaskRunStatus_new";

ALTER TYPE "TaskRunStatus" RENAME TO "TaskRunStatus_old";
ALTER TYPE "TaskRunStatus_new" RENAME TO "TaskRunStatus";
DROP TYPE "TaskRunStatus_old";

ALTER TABLE "TaskRun" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TYPE "TaskAttemptStatus_new" AS ENUM ('EXECUTING', 'COMPLETED', 'FAILED');

ALTER TABLE "TaskAttempt" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "TaskAttempt"
ALTER COLUMN "status" TYPE "TaskAttemptStatus_new"
USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'EXECUTING'
    WHEN 'RUNNING' THEN 'EXECUTING'
    WHEN 'SUCCEEDED' THEN 'COMPLETED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'CANCELED' THEN 'FAILED'
  END
)::"TaskAttemptStatus_new";

ALTER TYPE "TaskAttemptStatus" RENAME TO "TaskAttemptStatus_old";
ALTER TYPE "TaskAttemptStatus_new" RENAME TO "TaskAttemptStatus";
DROP TYPE "TaskAttemptStatus_old";

ALTER TABLE "TaskAttempt" ALTER COLUMN "status" SET DEFAULT 'EXECUTING';
