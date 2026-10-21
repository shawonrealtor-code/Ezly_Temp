-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRODUCER', 'CSR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "Lob" AS ENUM ('AUTO', 'HOME', 'DWELLING_FIRE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'SOLD', 'LOST');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('QUOTED', 'BOUND', 'ACTIVE', 'RENEWING', 'CANCELLED', 'EXPIRED', 'NON_RENEWED');

-- CreateTable
CREATE TABLE "Agency" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CSR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "naic" TEXT,
    "adapterKey" TEXT NOT NULL,
    "appointedStates" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'personal',
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT[],
    "customerSince" DATE,
    "producerId" UUID,
    "csrId" UUID,
    "leadSource" TEXT,
    "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "leadPriority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "relationship" TEXT NOT NULL DEFAULT 'primary',
    "prefix" TEXT,
    "firstName" TEXT NOT NULL,
    "middleInitial" TEXT,
    "lastName" TEXT NOT NULL,
    "suffix" TEXT,
    "nickname" TEXT,
    "gender" TEXT,
    "dateOfBirth" DATE,
    "maritalStatus" TEXT,
    "ssnEncrypted" TEXT,
    "dlNumberEncrypted" TEXT,
    "dlStatus" TEXT,
    "dlState" TEXT,
    "education" TEXT,
    "industry" TEXT,
    "occupation" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'home',
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "unit" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "state" CHAR(2) NOT NULL,
    "zip" TEXT NOT NULL,
    "zip4" TEXT,
    "yearsAt" INTEGER,
    "monthsAt" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'mobile',
    "number" TEXT NOT NULL,

    CONSTRAINT "Phone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'primary',
    "address" TEXT NOT NULL,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "lob" "Lob" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "risk" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRun" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "payPlan" TEXT NOT NULL DEFAULT 'full_pay',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierQuote" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "quoteRunId" UUID NOT NULL,
    "carrierKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "annualPremium" DECIMAL(12,2),
    "termMonths" INTEGER,
    "errors" TEXT[],

    CONSTRAINT "CarrierQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "carrierId" UUID NOT NULL,
    "sourceQuoteId" UUID,
    "lob" "Lob" NOT NULL,
    "policyNumber" TEXT,
    "status" "PolicyStatus" NOT NULL DEFAULT 'BOUND',
    "effectiveDate" DATE NOT NULL,
    "expirationDate" DATE NOT NULL,
    "writtenPremium" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "actorId" UUID,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_agencyId_adapterKey_key" ON "Carrier"("agencyId", "adapterKey");

-- CreateIndex
CREATE INDEX "Account_agencyId_leadStatus_idx" ON "Account"("agencyId", "leadStatus");

-- CreateIndex
CREATE INDEX "Person_agencyId_lastName_firstName_idx" ON "Person"("agencyId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Address_agencyId_zip_idx" ON "Address"("agencyId", "zip");

-- CreateIndex
CREATE INDEX "Phone_agencyId_number_idx" ON "Phone"("agencyId", "number");

-- CreateIndex
CREATE INDEX "Email_agencyId_address_idx" ON "Email"("agencyId", "address");

-- CreateIndex
CREATE INDEX "Policy_agencyId_expirationDate_idx" ON "Policy"("agencyId", "expirationDate");

-- CreateIndex
CREATE INDEX "AuditLog_agencyId_entity_entityId_idx" ON "AuditLog"("agencyId", "entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrier" ADD CONSTRAINT "Carrier_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_csrId_fkey" FOREIGN KEY ("csrId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phone" ADD CONSTRAINT "Phone_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRun" ADD CONSTRAINT "QuoteRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierQuote" ADD CONSTRAINT "CarrierQuote_quoteRunId_fkey" FOREIGN KEY ("quoteRunId") REFERENCES "QuoteRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "CarrierQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
