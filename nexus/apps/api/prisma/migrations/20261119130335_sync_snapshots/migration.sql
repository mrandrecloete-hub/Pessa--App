-- CreateTable
CREATE TABLE "sync_snapshots" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_snapshots_userId_key" ON "sync_snapshots"("userId");
