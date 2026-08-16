-- CreateTable
CREATE TABLE "DashboardSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardSession_tokenHash_key" ON "DashboardSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DashboardSession_userId_idx" ON "DashboardSession"("userId");

-- CreateIndex
CREATE INDEX "DashboardSession_expiresAt_idx" ON "DashboardSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "DashboardSession" ADD CONSTRAINT "DashboardSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
