-- CreateEnum
CREATE TYPE "TradeCategory" AS ENUM ('MECHANICAL', 'ELECTRICAL', 'PLUMBING', 'FIRE_PROTECTION', 'STRUCTURAL', 'ARCHITECTURAL', 'FINISHES', 'SPECIALTIES', 'EXTERIOR', 'SITE', 'EQUIPMENT', 'GENERAL');

-- CreateTable
CREATE TABLE "TradeCanonical" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "TradeCategory" NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeCanonical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rawTrade" TEXT NOT NULL,
    "tradeCanonicalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeCanonical_name_key" ON "TradeCanonical"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCanonical_code_key" ON "TradeCanonical"("code");

-- CreateIndex
CREATE INDEX "TradeCanonical_category_idx" ON "TradeCanonical"("category");

-- CreateIndex
CREATE UNIQUE INDEX "TradeMapping_organizationId_rawTrade_key" ON "TradeMapping"("organizationId", "rawTrade");

-- CreateIndex
CREATE INDEX "TradeMapping_organizationId_idx" ON "TradeMapping"("organizationId");

-- CreateIndex
CREATE INDEX "TradeMapping_tradeCanonicalId_idx" ON "TradeMapping"("tradeCanonicalId");

-- AddForeignKey
ALTER TABLE "TradeMapping" ADD CONSTRAINT "TradeMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeMapping" ADD CONSTRAINT "TradeMapping_tradeCanonicalId_fkey" FOREIGN KEY ("tradeCanonicalId") REFERENCES "TradeCanonical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
