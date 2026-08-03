-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM (
    'TASKS_READ',
    'TASKS_TRIGGER',
    'SCHEDULES_WRITE',
    'RUNS_READ',
    'RUNS_CANCEL',
    'RUNS_REPLAY',
    'DEPLOYMENTS_WRITE',
    'API_KEYS_MANAGE'
);

-- AlterTable
ALTER TABLE "ApiKey"
ADD COLUMN "scopes" "ApiKeyScope"[] NOT NULL DEFAULT ARRAY[
    'TASKS_READ',
    'TASKS_TRIGGER',
    'SCHEDULES_WRITE',
    'RUNS_READ',
    'RUNS_CANCEL',
    'RUNS_REPLAY',
    'DEPLOYMENTS_WRITE',
    'API_KEYS_MANAGE'
]::"ApiKeyScope"[],
ADD COLUMN "rotatedFromId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_rotatedFromId_key" ON "ApiKey"("rotatedFromId");

-- AddForeignKey
ALTER TABLE "ApiKey"
ADD CONSTRAINT "ApiKey_rotatedFromId_fkey"
FOREIGN KEY ("rotatedFromId") REFERENCES "ApiKey"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
