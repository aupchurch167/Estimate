-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN "bidDefaultDueDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "OrgSettings" ADD COLUMN "bidReminderDaysBefore" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "OrgSettings" ADD COLUMN "bidAutoCloseOnDue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgSettings" ADD COLUMN "bidPortalMessage" TEXT;
