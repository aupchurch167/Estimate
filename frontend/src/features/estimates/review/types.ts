export type ReviewActionType =
  | 'SUBMITTED_FOR_REVIEW'
  | 'APPROVED'
  | 'REQUESTED_CHANGES'
  | 'RESUBMITTED'
  | 'UNLOCKED'
  | 'REVISED';

export type EstimateStatusEnum =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SENT'
  | 'WON'
  | 'LOST'
  | 'REVISED';

export interface ReviewAction {
  id: string;
  estimateId: string;
  actorId: string;
  actionType: ReviewActionType;
  note: string | null;
  fromStatus: EstimateStatusEnum;
  toStatus: EstimateStatusEnum;
  createdAt: string;
}

export interface CommentAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Comment {
  id: string;
  estimateId: string;
  lineItemId: string | null;
  parentCommentId: string | null;
  body: string;
  isResolved: boolean;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastEditedAt: string | null;
  author: CommentAuthor;
}

export type ActivityEventType =
  | 'ESTIMATE_CREATED'
  | 'ESTIMATE_UPDATED'
  | 'ESTIMATE_DELETED'
  | 'ESTIMATE_STATUS_CHANGED'
  | 'LINE_ITEM_CREATED'
  | 'LINE_ITEM_UPDATED'
  | 'LINE_ITEM_DELETED'
  | 'LINE_ITEM_FLAGGED'
  | 'SOURCE_INPUT_ADDED'
  | 'SOURCE_INPUT_REMOVED'
  | 'AI_RUN_SUCCEEDED'
  | 'AI_RUN_FAILED'
  | 'ESTIMATE_SUBMITTED_FOR_REVIEW'
  | 'ESTIMATE_APPROVED'
  | 'ESTIMATE_CHANGES_REQUESTED'
  | 'ESTIMATE_SENT'
  | 'ESTIMATE_WON'
  | 'ESTIMATE_LOST'
  | 'ESTIMATE_REVISED'
  | 'ESTIMATE_EXPORTED'
  | 'COMMENT_ADDED'
  | 'COMMENT_RESOLVED'
  | 'USER_INVITED'
  | 'USER_JOINED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'PRICEBOOK_ENTRY_CREATED'
  | 'PRICEBOOK_ENTRY_UPDATED'
  | 'PRICEBOOK_BULK_IMPORTED';

export interface ActivityEvent {
  id: string;
  eventType: ActivityEventType;
  entityType: string;
  entityId: string;
  estimateId: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: CommentAuthor | null;
}
