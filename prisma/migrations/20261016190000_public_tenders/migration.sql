-- CreateTable
CREATE TABLE "PublicTender" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'pncp',
    "externalId" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "agencyCnpj" TEXT,
    "sphere" TEXT,
    "unitName" TEXT,
    "city" TEXT,
    "cityIbge" TEXT,
    "state" TEXT,
    "object" TEXT NOT NULL,
    "modality" TEXT,
    "modalityId" INTEGER,
    "disputeMode" TEXT,
    "situationId" INTEGER,
    "situationName" TEXT,
    "estimatedCents" BIGINT,
    "proposalOpensAt" TIMESTAMP(3),
    "proposalClosesAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftOpenListAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicTender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "stats" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicTender_externalId_key" ON "PublicTender"("externalId");
CREATE INDEX "PublicTender_state_city_idx" ON "PublicTender"("state", "city");
CREATE INDEX "PublicTender_proposalClosesAt_idx" ON "PublicTender"("proposalClosesAt");
CREATE INDEX "PublicTender_publishedAt_idx" ON "PublicTender"("publishedAt");
