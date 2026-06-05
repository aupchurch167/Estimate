export type BidPackageStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type BidRequestStatus = 'PENDING' | 'SENT' | 'VIEWED' | 'RESPONDED' | 'DECLINED' | 'EXPIRED';

export interface BidPackage {
  id: string;
  organizationId: string;
  estimateId: string;
  title: string;
  description: string | null;
  tradeCode: string | null;
  tradeCanonicalId: string | null;
  status: BidPackageStatus;
  dueDate: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  tradeCanonical: { id: string; name: string; code: string } | null;
  createdBy: { id: string; firstName: string; lastName: string; email: string };
  estimate: { id: string; title: string; number: string };
  bidRequests: BidRequest[];
}

export interface BidRequest {
  id: string;
  bidPackageId: string;
  coreVendorId: string | null;
  vendorName: string;
  vendorEmail: string;
  vendorPhone: string | null;
  status: BidRequestStatus;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  createdAt: string;
}

export interface BidResponse {
  id: string;
  bidRequestId: string;
  submissionSource: 'PORTAL' | 'EMAIL' | 'MANUAL';
  totalAmount: string | null;
  notes: string | null;
  submittedAt: string;
  lineItems: BidResponseLineItem[];
  attachments: BidResponseAttachment[];
  bidRequest: {
    id: string;
    vendorName: string;
    vendorEmail: string;
    bidPackageId: string;
    bidPackage: { id: string; title: string; estimateId: string };
  };
}

export interface BidResponseLineItem {
  id: string;
  description: string;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  notes: string | null;
  displayOrder: number;
}

export interface BidResponseAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface TradeCanonical {
  id: string;
  name: string;
  code: string;
  category: string;
  displayOrder: number;
}

export const BID_PACKAGE_STATUSES: BidPackageStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED'];

export const BID_STATUS_LABELS: Record<BidPackageStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const BID_REQUEST_STATUS_LABELS: Record<BidRequestStatus, string> = {
  PENDING: 'Pending',
  SENT: 'Sent',
  VIEWED: 'Viewed',
  RESPONDED: 'Responded',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};
