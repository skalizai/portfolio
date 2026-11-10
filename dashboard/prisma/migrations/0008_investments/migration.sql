-- Investments live in their own schema, apart from the job search and from stockradar.
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateEnum
CREATE TYPE "finance"."AccountType" AS ENUM ('BROKERAGE', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "finance"."AssetClass" AS ENUM ('STOCK', 'ETF', 'OTHER');

-- CreateEnum
CREATE TYPE "finance"."PriceSource" AS ENUM ('FINNHUB', 'MANUAL');

-- CreateEnum
CREATE TYPE "finance"."TransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'SPLIT');

-- CreateTable
CREATE TABLE "finance"."Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "finance"."AccountType" NOT NULL DEFAULT 'BROKERAGE',
    "institution" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" "finance"."AssetClass" NOT NULL DEFAULT 'STOCK',
    "exchange" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priceSource" "finance"."PriceSource" NOT NULL DEFAULT 'MANUAL',
    "sector" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "type" "finance"."TransactionType" NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(24,8),
    "price" DECIMAL(24,8),
    "amount" DECIMAL(24,8) NOT NULL,
    "fees" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "fxRateToBase" DECIMAL(24,10) NOT NULL,
    "notes" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."PriceQuote" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "price" DECIMAL(24,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "source" "finance"."PriceSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."FxRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(24,10) NOT NULL,
    "asOf" DATE NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "finance"."Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "finance"."Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_instrumentId_date_idx" ON "finance"."Transaction"("instrumentId", "date");

-- CreateIndex
CREATE INDEX "PriceQuote_instrumentId_asOf_idx" ON "finance"."PriceQuote"("instrumentId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_base_quote_asOf_key" ON "finance"."FxRate"("base", "quote", "asOf");

-- AddForeignKey
ALTER TABLE "finance"."Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."Transaction" ADD CONSTRAINT "Transaction_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "finance"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."PriceQuote" ADD CONSTRAINT "PriceQuote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "finance"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- As for jobmatch: with row-level security on and no policies, the Supabase REST API can read
-- nothing here. Prisma connects as the table owner, so the app is unaffected.
ALTER TABLE "finance"."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."Instrument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."PriceQuote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."FxRate" ENABLE ROW LEVEL SECURITY;
