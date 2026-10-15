-- Um CNPJ, um cadastro: o banco recusa duplicidade.
DROP INDEX IF EXISTS "Company_cnpj_idx";
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- Prazo de 1 hora para concluir um cadastro que ainda não foi pago.
ALTER TABLE "User" ADD COLUMN "pendingExpiresAt" TIMESTAMP(3);
