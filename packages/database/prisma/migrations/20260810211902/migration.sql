-- CreateTable
CREATE TABLE "RunEventOutbox" (
    "id" BIGSERIAL NOT NULL,
    "taskEventId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RunEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunEventOutbox_taskEventId_key" ON "RunEventOutbox"("taskEventId");

-- CreateIndex
CREATE INDEX "RunEventOutbox_publishedAt_id_idx" ON "RunEventOutbox"("publishedAt", "id");

-- AddForeignKey
ALTER TABLE "RunEventOutbox" ADD CONSTRAINT "RunEventOutbox_taskEventId_fkey" FOREIGN KEY ("taskEventId") REFERENCES "TaskEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
