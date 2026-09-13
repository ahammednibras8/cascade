-- CreateTable
CREATE TABLE "DashboardOnboarding" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardOnboarding_environmentId_idx" ON "DashboardOnboarding"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardOnboarding_userId_environmentId_key" ON "DashboardOnboarding"("userId", "environmentId");

-- AddForeignKey
ALTER TABLE "DashboardOnboarding" ADD CONSTRAINT "DashboardOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardOnboarding" ADD CONSTRAINT "DashboardOnboarding_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
