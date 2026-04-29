export type NotificationType =
  | 'ESTIMATE_ASSIGNED'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_CHANGES_REQUESTED'
  | 'COMMENT_MENTION'
  | 'ESTIMATE_WON'
  | 'ESTIMATE_LOST'
  | 'AI_RUN_FAILED'
  | 'INVITATION_ACCEPTED';

export interface AppNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  readAt: string | null;
  createdAt: string;
}
