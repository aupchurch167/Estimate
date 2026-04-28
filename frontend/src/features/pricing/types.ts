export type UnitOfMeasure =
  | 'SF'
  | 'LF'
  | 'CF'
  | 'EA'
  | 'HR'
  | 'DY'
  | 'LS'
  | 'CY'
  | 'SY'
  | 'GAL'
  | 'TON'
  | 'CUSTOM';

export const UNITS_OF_MEASURE: UnitOfMeasure[] = [
  'SF',
  'LF',
  'CF',
  'EA',
  'HR',
  'DY',
  'LS',
  'CY',
  'SY',
  'GAL',
  'TON',
  'CUSTOM',
];

export interface PriceBook {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceBookCategory {
  id: string;
  organizationId: string;
  priceBookId: string;
  name: string;
  description: string | null;
  csiDivision: string | null;
  defaultMarkupPercent: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
}

export interface PriceBookEntry {
  id: string;
  organizationId: string;
  priceBookId: string;
  categoryId: string;
  code: string | null;
  description: string;
  longDescription: string | null;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure: string | null;
  unitCostMaterial: string;
  unitCostLabor: string;
  defaultMarkupPercent: string | null;
  aiKeywords: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedEntries {
  data: PriceBookEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  categoriesToCreate: string[];
  entriesToCreate: number;
  entriesToUpdate: number;
  entriesSkipped: number;
  errors: { row: number; column?: string; message: string }[];
  committed: boolean;
}
