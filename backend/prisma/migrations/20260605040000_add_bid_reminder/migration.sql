-- CreateEnum
CREATE TYPE "BidReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "BidReminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "BidReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidReminder_status_scheduledFor_idx" ON "BidReminder"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "BidReminder_bidRequestId_idx" ON "BidReminder"("bidRequestId");

-- CreateIndex
CREATE INDEX "BidReminder_organizationId_idx" ON "BidReminder"("organizationId");

-- AddForeignKey
ALTER TABLE "BidReminder" ADD CONSTRAINT "BidReminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidReminder" ADD CONSTRAINT "BidReminder_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "BidRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
