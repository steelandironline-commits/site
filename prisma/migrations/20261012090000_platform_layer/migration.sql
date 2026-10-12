-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'CHARGE');

-- CreateEnum
CREATE TYPE "ProtectionStatus" AS ENUM ('NONE', 'HELD', 'RELEASE_REQUESTED', 'RELEASED', 'DISPUTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ActionChannel" AS ENUM ('WEB', 'WHATSAPP', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REJECTED', 'CONFIRMATION_REQUIRED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('OPPORTUNITIES', 'FREIGHT', 'WORKFORCE', 'PAYMENTS', 'SYSTEM', 'AGENTS');

-- CreateEnum
CREATE TYPE "FreightRequestStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FreightMatchStatus" AS ENUM ('NEW', 'ACCEPTED', 'REJECTED', 'DRIVER_ARRIVED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkforceDemandStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WorkforceMatchStatus" AS ENUM ('SUGGESTED', 'INVITED', 'ACCEPTED', 'DECLINED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "agentsPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutPixKey" TEXT,
ADD COLUMN     "payoutPixKeyType" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "payerDocument" TEXT,
ADD COLUMN     "payerEmail" TEXT,
ADD COLUMN     "payerName" TEXT,
ADD COLUMN     "protectionStatus" "ProtectionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "relatedId" TEXT,
ADD COLUMN     "relatedType" TEXT,
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ALTER COLUMN "subscriptionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "payload" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "channel" "ActionChannel" NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "error" TEXT,
    "challengeId" TEXT,
    "ipAddress" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveActionChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "requestedVia" "ActionChannel" NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "mechanism" TEXT NOT NULL DEFAULT 'WEB_PASSWORD',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedSessionId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveActionChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerContactId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "verificationCodeHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" JSONB,
    "providerMessageId" TEXT,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "domainEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppPendingCommand" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppPendingCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "cargo" TEXT,
    "status" "FreightRequestStatus" NOT NULL DEFAULT 'OPEN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreightRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreightMatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3),
    "cargo" TEXT,
    "weightKg" INTEGER,
    "price" INTEGER,
    "isReturnLoad" BOOLEAN NOT NULL DEFAULT false,
    "carrierName" TEXT,
    "source" TEXT NOT NULL,
    "status" "FreightMatchStatus" NOT NULL DEFAULT 'NEW',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreightMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceDemand" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "status" "WorkforceDemandStatus" NOT NULL DEFAULT 'OPEN',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceMatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "professionalName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "city" TEXT,
    "experienceYears" INTEGER,
    "rating" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "status" "WorkforceMatchStatus" NOT NULL DEFAULT 'SUGGESTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainEvent_processedAt_createdAt_idx" ON "DomainEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_companyId_createdAt_idx" ON "DomainEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DomainEvent_type_idx" ON "DomainEvent"("type");

-- CreateIndex
CREATE INDEX "ActionLog_companyId_createdAt_idx" ON "ActionLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionLog_action_idx" ON "ActionLog"("action");

-- CreateIndex
CREATE INDEX "SensitiveActionChallenge_userId_status_idx" ON "SensitiveActionChallenge"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_userId_key" ON "WhatsAppConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumber_key" ON "WhatsAppConnection"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageId_key" ON "WhatsAppMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_connectionId_createdAt_idx" ON "WhatsAppMessage"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppPendingCommand_connectionId_status_idx" ON "WhatsAppPendingCommand"("connectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_category_key" ON "NotificationPreference"("userId", "channel", "category");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_domainEventId_userId_channel_key" ON "NotificationDelivery"("domainEventId", "userId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "FreightRequest_companyId_createdAt_idx" ON "FreightRequest"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FreightMatch_companyId_status_idx" ON "FreightMatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "WorkforceDemand_companyId_createdAt_idx" ON "WorkforceDemand"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkforceMatch_companyId_status_idx" ON "WorkforceMatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "WorkforceMatch_demandId_idx" ON "WorkforceMatch"("demandId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensitiveActionChallenge" ADD CONSTRAINT "SensitiveActionChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPendingCommand" ADD CONSTRAINT "WhatsAppPendingCommand_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightRequest" ADD CONSTRAINT "FreightRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightMatch" ADD CONSTRAINT "FreightMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreightMatch" ADD CONSTRAINT "FreightMatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FreightRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceDemand" ADD CONSTRAINT "WorkforceDemand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceMatch" ADD CONSTRAINT "WorkforceMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceMatch" ADD CONSTRAINT "WorkforceMatch_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "WorkforceDemand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

