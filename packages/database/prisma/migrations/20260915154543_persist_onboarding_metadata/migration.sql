-- AlterTable
ALTER TABLE "DashboardOnboarding" ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "displayedStep" TEXT,
ADD COLUMN     "restartedAt" TIMESTAMP(3),
ADD COLUMN     "selectedSetupPath" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
