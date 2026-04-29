-- Add lastEditedAt for the 15-minute edit window. Index parentCommentId so
-- threaded fetches stay fast as the comment table grows.
ALTER TABLE "Comment" ADD COLUMN "lastEditedAt" TIMESTAMP(3);
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");
