-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deploymentId" UUID;

-- AlterTable
ALTER TABLE "TaskRun" ADD COLUMN     "deploymentId" UUID;

-- CreateTable
CREATE TABLE "Deployment" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_environmentId_status_idx" ON "Deployment"("environmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_environmentId_version_key" ON "Deployment"("environmentId", "version");

-- CreateIndex
CREATE INDEX "Task_deploymentId_idx" ON "Task"("deploymentId");

-- CreateIndex
CREATE INDEX "TaskRun_deploymentId_idx" ON "TaskRun"("deploymentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
