-- CreateTable
CREATE TABLE "CoreVendorCache" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "coreVendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "complianceStatus" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoreVendorCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoreProjectCache" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "coreProjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "coreAccountId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoreProjectCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoreVendorCache_organizationId_coreVendorId_key" ON "CoreVendorCache"("organizationId", "coreVendorId");

-- CreateIndex
CREATE INDEX "CoreVendorCache_organizationId_idx" ON "CoreVendorCache"("organizationId");

-- CreateIndex
CREATE INDEX "CoreVendorCache_organizationId_name_idx" ON "CoreVendorCache"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CoreProjectCache_organizationId_coreProjectId_key" ON "CoreProjectCache"("organizationId", "coreProjectId");

-- CreateIndex
CREATE INDEX "CoreProjectCache_organizationId_idx" ON "CoreProjectCache"("organizationId");

-- CreateIndex
CREATE INDEX "CoreProjectCache_organizationId_name_idx" ON "CoreProjectCache"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "CoreVendorCache" ADD CONSTRAINT "CoreVendorCache_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreProjectCache" ADD CONSTRAINT "CoreProjectCache_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
