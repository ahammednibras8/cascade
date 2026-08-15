-- AlterTable
ALTER TABLE "TaskEvent" ADD COLUMN     "parentSpanId" TEXT,
ADD COLUMN     "spanId" TEXT,
ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "traceId" TEXT,
ADD COLUMN     "triggerSpanId" TEXT;

-- CreateIndex
CREATE INDEX "TaskRun_traceId_idx" ON "TaskRun"("traceId");
