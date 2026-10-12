-- TemPix charges no subscription: the platform fee is a fixed 2% of every
-- contract between the parties. Move the untouched global default rule
-- (1.5%) to 2%. Company-specific or edited rules are left as they are.
WITH changed AS (
  UPDATE "CommissionRule"
     SET "rateBps" = 200, "name" = 'Padrão TemPix 2%', "updatedAt" = NOW()
   WHERE "companyId" IS NULL
     AND "transactionType" IS NULL
     AND "rateBps" = 150
     AND "name" = 'Padrão marketplace 1,5%'
  RETURNING "id"
)
INSERT INTO "FinancialAuditLog" ("id", "action", "source", "metadata", "createdAt")
SELECT 'mig_commission_2pct_' || "id", 'COMMISSION_RULE_UPDATED', 'SYSTEM',
       jsonb_build_object('ruleId', "id", 'fromRateBps', 150, 'toRateBps', 200, 'reason', 'Modelo TemPix: 2% fixo por contrato, sem assinatura'),
       NOW()
  FROM changed;
