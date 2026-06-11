-- CreateEnum
CREATE TYPE "BidPackageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BidRequestStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'RESPONDED', 'DECLINED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_PACKAGE_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_PACKAGE_PUBLISHED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_PACKAGE_CLOSED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_REQUEST_SENT';
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_REQUEST_RESPONDED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BID_REQUEST_DECLINED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BID_RESPONSE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'BID_REQUEST_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'BID_PACKAGE_CLOSED';

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tradeCode" TEXT,
    "tradeCanonicalId" TEXT,
    "status" "BidPackageStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "coreVendorId" TEXT,
    "vendorName" TEXT NOT NULL,
    "vendorEmail" TEXT NOT NULL,
    "vendorPhone" TEXT,
    "status" "BidRequestStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidPackage_organizationId_idx" ON "BidPackage"("organizationId");

-- CreateIndex
CREATE INDEX "BidPackage_estimateId_idx" ON "BidPackage"("estimateId");

-- CreateIndex
CREATE INDEX "BidPackage_organizationId_status_idx" ON "BidPackage"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BidRequest_accessToken_key" ON "BidRequest"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "BidRequest_bidPackageId_vendorEmail_key" ON "BidRequest"("bidPackageId", "vendorEmail");

-- CreateIndex
CREATE INDEX "BidRequest_organizationId_idx" ON "BidRequest"("organizationId");

-- CreateIndex
CREATE INDEX "BidRequest_bidPackageId_idx" ON "BidRequest"("bidPackageId");

-- CreateIndex
CREATE INDEX "BidRequest_accessToken_idx" ON "BidRequest"("accessToken");

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_tradeCanonicalId_fkey" FOREIGN KEY ("tradeCanonicalId") REFERENCES "TradeCanonical"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidRequest" ADD CONSTRAINT "BidRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidRequest" ADD CONSTRAINT "BidRequest_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
