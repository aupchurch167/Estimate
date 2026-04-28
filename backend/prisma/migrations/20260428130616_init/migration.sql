-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'ESTIMATOR', 'PM', 'VIEWER');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'WON', 'LOST', 'REVISED');

-- CreateEnum
CREATE TYPE "LineItemStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'NEEDS_REVIEW', 'ASSUMED', 'NO_PRICE', 'PENDING_SUB_QUOTE');

-- CreateEnum
CREATE TYPE "LineItemSource" AS ENUM ('AI_GENERATED', 'PRICEBOOK', 'MANUAL', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "SourceInputType" AS ENUM ('TRANSCRIPT', 'EMAIL', 'SCOPE_NOTES', 'PLAN_PDF', 'COMPANYCAM_PROJECT', 'MANUAL_TEXT', 'REFERENCE_DOC');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('SF', 'LF', 'CF', 'EA', 'HR', 'DY', 'LS', 'CY', 'SY', 'GAL', 'TON', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('APPROVAL', 'SEND', 'REVISION');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'XLSX');

-- CreateEnum
CREATE TYPE "MarkupRuleScope" AS ENUM ('CATEGORY', 'SECTION_NAME_MATCH', 'LINE_DESCRIPTION_MATCH');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AIRunType" AS ENUM ('GENERATE_LINE_ITEMS', 'DRAFT_EXEC_SUMMARY', 'SUGGEST_PRICE', 'CLASSIFY_SCOPE', 'ASK_FOLLOWUP', 'OTHER');

-- CreateEnum
CREATE TYPE "AIRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewActionType" AS ENUM ('SUBMITTED_FOR_REVIEW', 'APPROVED', 'REQUESTED_CHANGES', 'RESUBMITTED', 'UNLOCKED', 'REVISED');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('ESTIMATE_CREATED', 'ESTIMATE_UPDATED', 'ESTIMATE_DELETED', 'ESTIMATE_STATUS_CHANGED', 'LINE_ITEM_CREATED', 'LINE_ITEM_UPDATED', 'LINE_ITEM_DELETED', 'LINE_ITEM_FLAGGED', 'SOURCE_INPUT_ADDED', 'SOURCE_INPUT_REMOVED', 'AI_RUN_SUCCEEDED', 'AI_RUN_FAILED', 'ESTIMATE_SUBMITTED_FOR_REVIEW', 'ESTIMATE_APPROVED', 'ESTIMATE_CHANGES_REQUESTED', 'ESTIMATE_SENT', 'ESTIMATE_WON', 'ESTIMATE_LOST', 'ESTIMATE_REVISED', 'ESTIMATE_EXPORTED', 'COMMENT_ADDED', 'COMMENT_RESOLVED', 'USER_INVITED', 'USER_JOINED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'PRICEBOOK_ENTRY_CREATED', 'PRICEBOOK_ENTRY_UPDATED', 'PRICEBOOK_BULK_IMPORTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ESTIMATE_ASSIGNED', 'REVIEW_REQUESTED', 'REVIEW_APPROVED', 'REVIEW_CHANGES_REQUESTED', 'COMMENT_MENTION', 'ESTIMATE_WON', 'ESTIMATE_LOST', 'AI_RUN_FAILED', 'INVITATION_ACCEPTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyLegalName" TEXT,
    "logoUrl" TEXT,
    "primaryColorHex" TEXT NOT NULL DEFAULT '#1A1A1A',
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "estimateNumberPrefix" TEXT NOT NULL,
    "defaultMarkupPercent" DECIMAL(6,4),
    "drafterCanSend" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "monthlyAiCostCapUsd" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "drafterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "coachDealId" TEXT,
    "coachCompanyId" TEXT,
    "clientCompanyName" TEXT,
    "clientContactName" TEXT,
    "clientContactEmail" TEXT,
    "clientContactPhone" TEXT,
    "projectAddressLine1" TEXT,
    "projectAddressLine2" TEXT,
    "projectCity" TEXT,
    "projectState" TEXT,
    "projectPostalCode" TEXT,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalMarkup" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSellPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeSection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "markupPercent" DECIMAL(6,4),
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScopeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "scopeSectionId" TEXT NOT NULL,
    "priceBookEntryId" TEXT,
    "sourceRunId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitOfMeasure" "UnitOfMeasure" NOT NULL,
    "customUnitOfMeasure" TEXT,
    "unitCostMaterial" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitCostLabor" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "markupPercent" DECIMAL(6,4) NOT NULL,
    "lineCost" DECIMAL(12,2) NOT NULL,
    "lineSellPrice" DECIMAL(12,2) NOT NULL,
    "status" "LineItemStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "LineItemSource" NOT NULL,
    "aiConfidence" DECIMAL(4,3),
    "aiAssumption" TEXT,
    "subQuoteFrom" TEXT,
    "subQuoteReceivedAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "clientNotes" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "snapshotType" "SnapshotType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "estimateData" JSONB NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "totalMarkup" DECIMAL(12,2) NOT NULL,
    "totalSellPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceInput" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "type" "SourceInputType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "externalRefId" TEXT,
    "externalRefUrl" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SourceInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateExport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "exportedById" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pdfOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "csiDivision" TEXT,
    "defaultMarkupPercent" DECIMAL(6,4),
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBookCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "longDescription" TEXT,
    "unitOfMeasure" "UnitOfMeasure" NOT NULL,
    "customUnitOfMeasure" TEXT,
    "unitCostMaterial" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitCostLabor" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "defaultMarkupPercent" DECIMAL(6,4),
    "aiKeywords" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PriceBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkupRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priceBookId" TEXT,
    "name" TEXT NOT NULL,
    "appliesTo" "MarkupRuleScope" NOT NULL,
    "matchValue" TEXT NOT NULL,
    "markupPercent" DECIMAL(6,4) NOT NULL,
    "priority" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MarkupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "totalTokensInput" INTEGER NOT NULL DEFAULT 0,
    "totalTokensOutput" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "authorUserId" TEXT,
    "content" TEXT NOT NULL,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "costUsd" DECIMAL(10,6),
    "toolCalls" JSONB,
    "runId" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "triggeredById" TEXT NOT NULL,
    "runType" "AIRunType" NOT NULL,
    "status" "AIRunStatus" NOT NULL,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB,
    "errorMessage" TEXT,
    "modelVersion" TEXT NOT NULL,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "costUsd" DECIMAL(10,6),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AIRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" "ReviewActionType" NOT NULL,
    "note" TEXT,
    "fromStatus" "EstimateStatus" NOT NULL,
    "toStatus" "EstimateStatus" NOT NULL,
    "snapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "ActivityEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "estimateId" TEXT,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_email_idx" ON "Invitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Estimate_organizationId_status_idx" ON "Estimate"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Estimate_organizationId_drafterId_idx" ON "Estimate"("organizationId", "drafterId");

-- CreateIndex
CREATE INDEX "Estimate_organizationId_reviewerId_idx" ON "Estimate"("organizationId", "reviewerId");

-- CreateIndex
CREATE INDEX "Estimate_coachDealId_idx" ON "Estimate"("coachDealId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_organizationId_number_key" ON "Estimate"("organizationId", "number");

-- CreateIndex
CREATE INDEX "ScopeSection_estimateId_order_idx" ON "ScopeSection"("estimateId", "order");

-- CreateIndex
CREATE INDEX "LineItem_scopeSectionId_order_idx" ON "LineItem"("scopeSectionId", "order");

-- CreateIndex
CREATE INDEX "LineItem_estimateId_status_idx" ON "LineItem"("estimateId", "status");

-- CreateIndex
CREATE INDEX "LineItem_organizationId_priceBookEntryId_idx" ON "LineItem"("organizationId", "priceBookEntryId");

-- CreateIndex
CREATE INDEX "EstimateSnapshot_estimateId_sequence_idx" ON "EstimateSnapshot"("estimateId", "sequence");

-- CreateIndex
CREATE INDEX "EstimateSnapshot_estimateId_snapshotType_idx" ON "EstimateSnapshot"("estimateId", "snapshotType");

-- CreateIndex
CREATE INDEX "SourceInput_estimateId_type_idx" ON "SourceInput"("estimateId", "type");

-- CreateIndex
CREATE INDEX "SourceInput_organizationId_type_idx" ON "SourceInput"("organizationId", "type");

-- CreateIndex
CREATE INDEX "EstimateExport_estimateId_createdAt_idx" ON "EstimateExport"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceBook_organizationId_isDefault_idx" ON "PriceBook"("organizationId", "isDefault");

-- CreateIndex
CREATE INDEX "PriceBookCategory_priceBookId_order_idx" ON "PriceBookCategory"("priceBookId", "order");

-- CreateIndex
CREATE INDEX "PriceBookCategory_organizationId_name_idx" ON "PriceBookCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PriceBookEntry_priceBookId_categoryId_idx" ON "PriceBookEntry"("priceBookId", "categoryId");

-- CreateIndex
CREATE INDEX "PriceBookEntry_organizationId_usageCount_idx" ON "PriceBookEntry"("organizationId", "usageCount");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBookEntry_organizationId_code_key" ON "PriceBookEntry"("organizationId", "code");

-- CreateIndex
CREATE INDEX "MarkupRule_organizationId_isActive_priority_idx" ON "MarkupRule"("organizationId", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AIConversation_estimateId_key" ON "AIConversation"("estimateId");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_order_idx" ON "AIMessage"("conversationId", "order");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRun_estimateId_createdAt_idx" ON "AIRun"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRun_organizationId_runType_status_idx" ON "AIRun"("organizationId", "runType", "status");

-- CreateIndex
CREATE INDEX "AIRun_organizationId_createdAt_idx" ON "AIRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_estimateId_createdAt_idx" ON "Comment"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_lineItemId_isResolved_idx" ON "Comment"("lineItemId", "isResolved");

-- CreateIndex
CREATE INDEX "Comment_organizationId_isResolved_createdAt_idx" ON "Comment"("organizationId", "isResolved", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAction_estimateId_createdAt_idx" ON "ReviewAction"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAction_organizationId_actorId_createdAt_idx" ON "ReviewAction"("organizationId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_organizationId_createdAt_idx" ON "ActivityEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_estimateId_createdAt_idx" ON "ActivityEvent"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_organizationId_actorId_createdAt_idx" ON "ActivityEvent"("organizationId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_organizationId_eventType_createdAt_idx" ON "ActivityEvent"("organizationId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_type_createdAt_idx" ON "Notification"("organizationId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_drafterId_fkey" FOREIGN KEY ("drafterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeSection" ADD CONSTRAINT "ScopeSection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeSection" ADD CONSTRAINT "ScopeSection_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeSection" ADD CONSTRAINT "ScopeSection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PriceBookCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_scopeSectionId_fkey" FOREIGN KEY ("scopeSectionId") REFERENCES "ScopeSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_priceBookEntryId_fkey" FOREIGN KEY ("priceBookEntryId") REFERENCES "PriceBookEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSnapshot" ADD CONSTRAINT "EstimateSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSnapshot" ADD CONSTRAINT "EstimateSnapshot_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSnapshot" ADD CONSTRAINT "EstimateSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceInput" ADD CONSTRAINT "SourceInput_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceInput" ADD CONSTRAINT "SourceInput_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceInput" ADD CONSTRAINT "SourceInput_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateExport" ADD CONSTRAINT "EstimateExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateExport" ADD CONSTRAINT "EstimateExport_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateExport" ADD CONSTRAINT "EstimateExport_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "EstimateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateExport" ADD CONSTRAINT "EstimateExport_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookCategory" ADD CONSTRAINT "PriceBookCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookCategory" ADD CONSTRAINT "PriceBookCategory_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookEntry" ADD CONSTRAINT "PriceBookEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PriceBookCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkupRule" ADD CONSTRAINT "MarkupRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkupRule" ADD CONSTRAINT "MarkupRule_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AIRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRun" ADD CONSTRAINT "AIRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
