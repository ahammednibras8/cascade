-- CreateTable
CREATE TABLE "DeploymentTask" (
    "id" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "executionConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentTask_deploymentId_slug_key" ON "DeploymentTask"("deploymentId", "slug");

-- AddForeignKey
ALTER TABLE "DeploymentTask" ADD CONSTRAINT "DeploymentTask_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
