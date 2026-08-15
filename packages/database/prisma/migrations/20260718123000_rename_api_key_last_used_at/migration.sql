ALTER TABLE "ApiKey" RENAME COLUMN "lasUsedAt" TO "lastUsedAt";

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
