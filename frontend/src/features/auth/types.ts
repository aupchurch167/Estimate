/**
 * Auth-related types mirroring the backend response shapes
 * (see backend/src/services/authService.ts → toSafeUser).
 */

export type UserRole = 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';

export interface SafeUser {
  id: string;
  organizationId: string;
  email: string;
  emailVerifiedAt: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSettings {
  id: string;
  organizationId: string;
  companyLegalName: string | null;
  logoUrl: string | null;
  primaryColorHex: string;
  contactPhone: string | null;
  contactEmail: string | null;
  estimateNumberPrefix: string;
  defaultMarkupPercent: string | null;
  drafterCanSend: boolean;
  timezone: string;
  monthlyAiCostCapUsd: string | null;
}

export interface AuthMeResponse {
  user: SafeUser;
  organization: Organization;
  settings: OrgSettings;
}
