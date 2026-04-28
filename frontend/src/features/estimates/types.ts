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

// ─── Workspace detail (GET /api/estimates/:id) ────────────────────────────

export interface ScopeSection {
  id: string;
  estimateId: string;
  name: string;
  description: string | null;
  order: number;
  markupPercent: string | null;
}

export interface LineItem {
  id: string;
  estimateId: string;
  scopeSectionId: string;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitCostMaterial: string;
  unitCostLabor: string;
  markupPercent: string;
  lineCost: string;
  lineSellPrice: string;
  status: string;
  source: string;
  aiConfidence: string | null;
  aiAssumption: string | null;
  order: number;
}

export interface SourceInput {
  id: string;
  estimateId: string;
  type: string;
  title: string;
  content: string | null;
  fileUrl: string | null;
  createdAt: string;
}

export interface EstimateDetail extends Estimate {
  scopeSections: ScopeSection[];
  lineItems: LineItem[];
  sourceInputs: SourceInput[];
  conversation: { id: string } | null;
}
