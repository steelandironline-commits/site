-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SessionScope" AS ENUM ('ONBOARDING', 'FULL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'RESEARCHING', 'CONTACTED', 'INTERESTED', 'PROPOSAL', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OpportunityPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('SEARCH', 'RESEARCH', 'SIGNAL', 'OPPORTUNITY', 'AGENT', 'SYSTEM', 'PAYMENT');

-- CreateEnum
CREATE TYPE "AgentKey" AS ENUM ('RADAR', 'RESEARCH', 'SIGNAL', 'SCORING', 'SALES');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('PAYMENT', 'SCHEDULED', 'PROFILE_UPDATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('EXPANSION', 'HIRING', 'CONSTRUCTION', 'PURCHASE', 'NEW_PROJECT', 'DEMAND');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('DEMO', 'SEARCH', 'WEBSITE', 'NEWS', 'PUBLIC_REGISTRY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "companyId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "SessionScope" NOT NULL DEFAULT 'FULL',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "serviceLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceRadiusKm" INTEGER,
    "description" TEXT,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idealCustomer" TEXT,
    "averageTicket" INTEGER,
    "minimumDeal" INTEGER,
    "preferredIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompletedAt" TIMESTAMP(3),
    "searchConfigVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'AUTOPIX',
    "priceCents" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "method" TEXT NOT NULL DEFAULT 'PIX',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "pixQrCodeBase64" TEXT,
    "pixCopyPaste" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "targetCompanyName" TEXT NOT NULL,
    "targetWebsite" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "state" TEXT,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "priority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
    "signal" TEXT NOT NULL,
    "signalType" "SignalType",
    "description" TEXT,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchingServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedMinValue" INTEGER,
    "estimatedMaxValue" INTEGER,
    "suggestedApproach" TEXT,
    "notes" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunitySource" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "snippet" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunitySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT NOT NULL,
    "agentId" TEXT,
    "opportunityId" TEXT,
    "jobId" TEXT,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "key" "AgentKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "metrics" JSONB,
    "metadata" JSONB,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySignal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "targetCompanyName" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "strength" DOUBLE PRECISION NOT NULL,
    "sourceUrl" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "companyPhone" TEXT,
    "businessEmail" TEXT,
    "linkedinUrl" TEXT,
    "publicSource" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "JobTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "companiesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "signalsDetected" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesCreated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Company_cnpj_idx" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_companyId_createdAt_idx" ON "Payment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_providerPaymentId_idx" ON "PaymentEvent"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_status_idx" ON "Opportunity"("companyId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_createdAt_idx" ON "Opportunity"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_score_idx" ON "Opportunity"("companyId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_companyId_targetKey_key" ON "Opportunity"("companyId", "targetKey");

-- CreateIndex
CREATE INDEX "OpportunitySource_opportunityId_idx" ON "OpportunitySource"("opportunityId");

-- CreateIndex
CREATE INDEX "ActivityEvent_companyId_idx" ON "ActivityEvent"("companyId");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");

-- CreateIndex
CREATE INDEX "ActivityEvent_companyId_createdAt_idx" ON "ActivityEvent"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_key_key" ON "Agent"("key");

-- CreateIndex
CREATE INDEX "AgentRun_companyId_startedAt_idx" ON "AgentRun"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_startedAt_idx" ON "AgentRun"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_jobId_idx" ON "AgentRun"("jobId");

-- CreateIndex
CREATE INDEX "CompanySignal_companyId_detectedAt_idx" ON "CompanySignal"("companyId", "detectedAt");

-- CreateIndex
CREATE INDEX "CompanySignal_opportunityId_idx" ON "CompanySignal"("opportunityId");

-- CreateIndex
CREATE INDEX "Contact_opportunityId_idx" ON "Contact"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationToken_tokenHash_key" ON "ActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActivationToken_userId_idx" ON "ActivationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "SearchJob_status_runAt_idx" ON "SearchJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "SearchJob_companyId_createdAt_idx" ON "SearchJob"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySource" ADD CONSTRAINT "OpportunitySource_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySignal" ADD CONSTRAINT "CompanySignal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchJob" ADD CONSTRAINT "SearchJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
