-- Isolamento por área (Tem CNPJ / Tem CPF / admin). Só aditiva e idempotente:
-- colunas nulas, sem default e sem backfill. O código antigo ignora as colunas novas.
-- A área de um registro de negócio continua vindo do dono (Company.accountType).
DO $$ BEGIN CREATE TYPE "Area" AS ENUM ('CNPJ', 'CPF', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Session"            ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "LoginChallenge"     ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "ActivationToken"    ADD COLUMN IF NOT EXISTS "area" "Area";
ALTER TABLE "PasswordResetToken" ADD COLUMN IF NOT EXISTS "area" "Area";
