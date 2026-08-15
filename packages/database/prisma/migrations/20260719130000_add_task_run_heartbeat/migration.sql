ALTER TABLE "TaskRun" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "TaskRun_status_lastHeartbeatAt_idx"
    ON "TaskRun"("status", "lastHeartbeatAt");
