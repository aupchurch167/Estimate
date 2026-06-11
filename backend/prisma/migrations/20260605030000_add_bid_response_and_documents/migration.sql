-- CreateEnum
CREATE TYPE "BidSubmissionSource" AS ENUM ('PORTAL', 'EMAIL', 'MANUAL');

-- AlterEnum
ALTER TYPE "LineItemSource" ADD VALUE 'BID_RESPONSE';

-- CreateTable
CREATE TABLE "BidResponse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "submissionSource" "BidSubmissionSource" NOT NULL DEFAULT 'PORTAL',
    "totalAmount" DECIMAL(12,2),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidResponseLineItem" (
    "id" TEXT NOT NULL,
    "bidResponseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "unitPrice" DECIMAL(12,4),
    "totalPrice" DECIMAL(12,2),
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidResponseLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidResponseAttachment" (
    "id" TEXT NOT NULL,
    "bidResponseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidResponseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BidResponse_bidRequestId_key" ON "BidResponse"("bidRequestId");

-- CreateIndex
CREATE INDEX "BidResponse_organizationId_idx" ON "BidResponse"("organizationId");

-- CreateIndex
CREATE INDEX "BidResponse_bidRequestId_idx" ON "BidResponse"("bidRequestId");

-- CreateIndex
CREATE INDEX "BidResponseLineItem_bidResponseId_idx" ON "BidResponseLineItem"("bidResponseId");

-- CreateIndex
CREATE INDEX "BidResponseAttachment_bidResponseId_idx" ON "BidResponseAttachment"("bidResponseId");

-- CreateIndex
CREATE INDEX "BidDocument_bidPackageId_idx" ON "BidDocument"("bidPackageId");

-- CreateIndex
CREATE INDEX "BidDocument_organizationId_idx" ON "BidDocument"("organizationId");

-- AddForeignKey
ALTER TABLE "BidResponse" ADD CONSTRAINT "BidResponse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidResponse" ADD CONSTRAINT "BidResponse_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "BidRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidResponseLineItem" ADD CONSTRAINT "BidResponseLineItem_bidResponseId_fkey" FOREIGN KEY ("bidResponseId") REFERENCES "BidResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidResponseAttachment" ADD CONSTRAINT "BidResponseAttachment_bidResponseId_fkey" FOREIGN KEY ("bidResponseId") REFERENCES "BidResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDocument" ADD CONSTRAINT "BidDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDocument" ADD CONSTRAINT "BidDocument_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDocument" ADD CONSTRAINT "BidDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
