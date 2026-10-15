-- Structured operational profile (dynamic onboarding + matching).
ALTER TABLE "Company" ADD COLUMN "operationalProfile" JSONB;
ALTER TABLE "Company" ADD COLUMN "operationalProfileUpdatedAt" TIMESTAMP(3);
