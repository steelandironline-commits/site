ALTER TYPE "PaymentKind" ADD VALUE 'INTERVIEW_FEE';
ALTER TYPE "PaymentKind" ADD VALUE 'HIRING_FEE';

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ActivationToken" ADD COLUMN "emailSentAt" TIMESTAMP(3);

CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginChallenge_userId_expiresAt_idx" ON "LoginChallenge"("userId", "expiresAt");
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SensitiveActionChallenge" ADD COLUMN "verificationCodeHash" TEXT;

ALTER TABLE "WorkforceMatch"
    ADD COLUMN "interviewScheduledAt" TIMESTAMP(3),
    ADD COLUMN "interviewCandidateEmail" TEXT,
    ADD COLUMN "interviewFeePaidAt" TIMESTAMP(3),
    ADD COLUMN "interviewCanceledAt" TIMESTAMP(3),
    ADD COLUMN "agreedSalaryCents" INTEGER,
    ADD COLUMN "hiringFeePaidAt" TIMESTAMP(3);
