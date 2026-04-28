export type EstimateStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SENT'
  | 'WON'
  | 'LOST'
  | 'REVISED';

export const ESTIMATE_STATUSES: EstimateStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT',
  'WON',
  'LOST',
  'REVISED',
];

export interface Estimate {
  id: string;
  organizationId: string;
  number: string;
  title: string;
  description: string | null;
  status: EstimateStatus;
  drafterId: string;
  reviewerId: string | null;
  clientCompanyName: string | null;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  projectAddressLine1: string | null;
  projectAddressLine2: string | null;
  projectCity: string | null;
  projectState: string | null;
  projectPostalCode: string | null;
  totalCost: string;
  totalMarkup: string;
  totalSellPrice: string;
  validUntil: string | null;
  sentAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedEstimates {
  data: Estimate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
