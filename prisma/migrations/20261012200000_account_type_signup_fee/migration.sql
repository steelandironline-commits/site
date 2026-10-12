-- Accounts are either a company (CNPJ, one-time signup fee) or a
-- professional (pessoa física, free signup).
CREATE TYPE "AccountType" AS ENUM ('COMPANY', 'PERSON');
ALTER TABLE "Company" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'COMPANY';

-- One-time company signup fee (no subscription).
ALTER TYPE "PaymentKind" ADD VALUE 'SIGNUP_FEE';
