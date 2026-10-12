-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'IGNORED', 'FAILED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('NOT_STARTED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT', 'AT_DESTINATION', 'DELIVERED');

-- CreateEnum
CREATE TYPE "TripEventType" AS ENUM ('DRIVER_EN_ROUTE_PICKUP', 'DRIVER_ARRIVED_PICKUP', 'CARGO_LOADED', 'TRIP_STARTED', 'NEAR_DESTINATION', 'DRIVER_ARRIVED_DESTINATION', 'DELIVERY_CONFIRMED', 'LOCATION_UPDATE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALES', 'FREIGHT', 'WORKFORCE', 'SERVICE', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'PROTECTED', 'READY_TO_RELEASE', 'RELEASED', 'REFUNDED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'BUYER_RESPONSE', 'SELLER_RESPONSE', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('WEB', 'PWA', 'WHATSAPP', 'SYSTEM', 'WORKER', 'ADMIN', 'API');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'AUTO_REPAIRED');

-- AlterTable
ALTER TABLE "FreightMatch" ADD COLUMN     "destLat" DOUBLE PRECISION,
ADD COLUMN     "destLng" DOUBLE PRECISION,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "trackingConsentAt" TIMESTAMP(3),
ADD COLUMN     "trackingConsentUserId" TEXT,
ADD COLUMN     "tripStatus" "TripStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refundedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transactionId" TEXT,
ADD COLUMN     "txid" TEXT;

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "error" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "payloadHash" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingStatus" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MarketplaceTransaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "sellerCompanyId" TEXT NOT NULL,
    "sellerUserId" TEXT,
    "buyerCompanyId" TEXT,
    "buyerUserId" TEXT,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "grossAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "providerFeesAmount" INTEGER NOT NULL DEFAULT 0,
    "sellerNetAmount" INTEGER NOT NULL,
    "commissionRuleId" TEXT,
    "commissionRateBps" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "protectedFlow" BOOLEAN NOT NULL DEFAULT false,
    "settlementStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "serviceStartedAt" TIMESTAMP(3),
    "sellerCompletedAt" TIMESTAMP(3),
    "buyerConfirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transactionType" "TransactionType",
    "companyId" TEXT,
    "rateBps" INTEGER NOT NULL,
    "fixedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "minimumCents" INTEGER,
    "maximumCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "beneficiaryType" TEXT NOT NULL,
    "beneficiaryReference" TEXT NOT NULL,
    "grossShare" INTEGER NOT NULL,
    "netShare" INTEGER NOT NULL,
    "providerAllocationId" TEXT,
    "status" "AllocationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRefundId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerPayoutId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDispute" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "transactionId" TEXT,
    "paymentId" TEXT,
    "action" TEXT NOT NULL,
    "source" "AuditSource" NOT NULL,
    "ipAddressHash" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationIssue" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "refundId" TEXT,
    "kind" TEXT NOT NULL,
    "localStatus" TEXT,
    "providerStatus" TEXT,
    "details" JSONB,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "freightMatchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "TripEventType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_sellerCompanyId_createdAt_idx" ON "MarketplaceTransaction"("sellerCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_buyerCompanyId_createdAt_idx" ON "MarketplaceTransaction"("buyerCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_status_idx" ON "MarketplaceTransaction"("status");

-- CreateIndex
CREATE INDEX "MarketplaceTransaction_referenceType_referenceId_idx" ON "MarketplaceTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "TransactionEvent_transactionId_createdAt_idx" ON "TransactionEvent"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionRule_active_transactionType_idx" ON "CommissionRule"("active", "transactionType");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "TransactionDispute_status_createdAt_idx" ON "TransactionDispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_companyId_createdAt_idx" ON "FinancialAuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_transactionId_idx" ON "FinancialAuditLog"("transactionId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_paymentId_idx" ON "FinancialAuditLog"("paymentId");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_status_createdAt_idx" ON "ReconciliationIssue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReconciliationIssue_paymentId_kind_idx" ON "ReconciliationIssue"("paymentId", "kind");

-- CreateIndex
CREATE INDEX "TripEvent_freightMatchId_createdAt_idx" ON "TripEvent"("freightMatchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "PaymentEvent_processingStatus_createdAt_idx" ON "PaymentEvent"("processingStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDispute" ADD CONSTRAINT "TransactionDispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "MarketplaceTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationIssue" ADD CONSTRAINT "ReconciliationIssue_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_freightMatchId_fkey" FOREIGN KEY ("freightMatchId") REFERENCES "FreightMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- FinancialAuditLog is append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION autopix_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'FinancialAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER financial_audit_log_no_update
  BEFORE UPDATE OR DELETE ON "FinancialAuditLog"
  FOR EACH ROW EXECUTE FUNCTION autopix_audit_log_immutable();
