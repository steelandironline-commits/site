-- Vagas de emprego públicas (área CPF). Migração só aditiva: CREATE TABLE e CREATE INDEX, idempotentes.
-- Nenhuma tabela existente é tocada. Apagar vagas antigas é feito pelo worker (retenção de 60 dias), não aqui.

-- CreateTable
CREATE TABLE IF NOT EXISTS "JobListing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "city" TEXT,
    "state" TEXT,
    "area" TEXT NOT NULL,
    "salaryMin" DECIMAL(12,2),
    "salaryMax" DECIMAL(12,2),
    "salaryPeriod" TEXT,
    "salaryText" TEXT,
    "description" TEXT NOT NULL,
    "contactWhatsapp" TEXT,
    "contactEmail" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scoreLevel" TEXT NOT NULL,
    "scoreValue" INTEGER NOT NULL,
    "scoreReasons" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobListing_area_idx" ON "JobListing"("area");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "JobListing_postedAt_idx" ON "JobListing"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "JobListing_source_externalId_key" ON "JobListing"("source", "externalId");
