-- New publications; existing contracts and payment snapshots stay intact.
CREATE TABLE "SocialPost" (
 "id" TEXT NOT NULL PRIMARY KEY, "transactionId" TEXT, "authorUserId" TEXT NOT NULL,
 "body" TEXT NOT NULL, "photo" TEXT, "repostOfId" TEXT, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SocialPost_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE CASCADE,
 CONSTRAINT "SocialPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "SocialPost_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "SocialPost"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "SocialPost_transactionId_authorUserId_key" ON "SocialPost"("transactionId", "authorUserId");
CREATE UNIQUE INDEX "SocialPost_repostOfId_authorUserId_key" ON "SocialPost"("repostOfId", "authorUserId");
CREATE INDEX "SocialPost_createdAt_id_idx" ON "SocialPost"("createdAt", "id");
CREATE TABLE "SocialComment" (
 "id" TEXT NOT NULL PRIMARY KEY, "postId" TEXT NOT NULL, "authorUserId" TEXT NOT NULL,
 "body" TEXT NOT NULL, "parentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE,
 CONSTRAINT "SocialComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "SocialComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SocialComment"("id") ON DELETE CASCADE
);
CREATE INDEX "SocialComment_postId_createdAt_idx" ON "SocialComment"("postId", "createdAt");
-- Fixed marketplace rate on new transactions, with a financial audit of each change.
INSERT INTO "FinancialAuditLog" ("id", "action", "source", "metadata", "createdAt")
SELECT 'social_2pct_' || "id", 'COMMISSION_RULE_UPDATED', 'SYSTEM',
 jsonb_build_object('ruleId', "id", 'fromRateBps', "rateBps", 'toRateBps', 200,
 'reason', '2% do valor intermediado com sucesso'), NOW()
FROM "CommissionRule" WHERE ("transactionType" IS NULL OR "transactionType" <> 'SUBSCRIPTION')
 AND ("rateBps" <> 200 OR "fixedAmountCents" <> 0 OR "minimumCents" IS NOT NULL OR "maximumCents" IS NOT NULL);
UPDATE "CommissionRule" SET "rateBps" = 200, "fixedAmountCents" = 0,
 "minimumCents" = NULL, "maximumCents" = NULL, "updatedAt" = NOW()
WHERE "transactionType" IS NULL OR "transactionType" <> 'SUBSCRIPTION';
