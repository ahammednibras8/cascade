-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "executionConfig" JSONB;

-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "executionConfig" JSONB;
