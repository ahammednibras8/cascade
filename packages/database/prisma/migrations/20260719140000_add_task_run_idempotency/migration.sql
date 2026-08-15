ALTER TABLE "TaskRun" ADD COLUMN "idempotencyKeyHash" TEXT;
ALTER TABLE "TaskRun" ADD COLUMN "idempotencyRequestHash" TEXT;

CREATE UNIQUE INDEX "TaskRun_taskId_idempotencyKeyHash_key"
    ON "TaskRun"("taskId", "idempotencyKeyHash");
