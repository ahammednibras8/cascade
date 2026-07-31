-- CreateEnum
CREATE TYPE "DeploymentRuntimeStatus" AS ENUM ('PENDING', 'STARTING', 'RUNNING', 'DRAINING', 'STOPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "runtimeContainerId" TEXT,
ADD COLUMN     "runtimeError" TEXT,
ADD COLUMN     "runtimeStartedAt" TIMESTAMP(3),
ADD COLUMN     "runtimeStatus" "DeploymentRuntimeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "runtimeStoppedAt" TIMESTAMP(3);
