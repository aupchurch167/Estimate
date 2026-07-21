-- Proof integration: local cache of the Proof vendor directory + COI status,
-- and a link from bid requests to the Proof vendor they were sent to.

-- CreateTable
CREATE TABLE "ProofVendorCache" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "proofVendorId" TEXT NOT NULL,
    "coreVendorId" TEXT,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "coiStatus" TEXT,
    "coiExpiresAt" TEXT,
    "coiLastRequestedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofVendorCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProofVendorCache_organizationId_proofVendorId_key" ON "ProofVendorCache"("organizationId", "proofVendorId");

-- CreateIndex
CREATE INDEX "ProofVendorCache_organizationId_idx" ON "ProofVendorCache"("organizationId");

-- CreateIndex
CREATE INDEX "ProofVendorCache_organizationId_name_idx" ON "ProofVendorCache"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "ProofVendorCache" ADD CONSTRAINT "ProofVendorCache_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "BidRequest" ADD COLUMN "proofVendorId" TEXT;
