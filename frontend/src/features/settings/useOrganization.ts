import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { ME_QUERY_KEY } from '@/features/auth/useAuth';
import type { Organization, OrgSettings } from '@/features/auth/types';

export const ORG_QUERY_KEY = ['org', 'current'] as const;

export interface OrgWithSettings {
  organization: Organization;
  settings: OrgSettings | null;
}

export function useOrganization() {
  return useQuery<OrgWithSettings, AxiosError>({
    queryKey: ORG_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<OrgWithSettings>('/api/organizations/current');
      return res.data;
    },
  });
}

export interface UpdateOrgInput {
  name?: string;
}
export function usePatchOrganization() {
  const qc = useQueryClient();
  return useMutation<Organization, AxiosError, UpdateOrgInput>({
    mutationFn: async (patch) => {
      const res = await api.patch<{ organization: Organization }>(
        '/api/organizations/current',
        patch,
      );
      return res.data.organization;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORG_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export type UpdateSettingsInput = Partial<{
  companyLegalName: string | null;
  primaryColorHex: string;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  estimateNumberPrefix: string;
  defaultMarkupPercent: string;
  drafterCanSend: boolean;
  timezone: string;
  monthlyAiCostCapUsd: string | null;
  confirmUnlimited: boolean;
  logoUrl: string | null;
}>;

export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation<OrgSettings, AxiosError, UpdateSettingsInput>({
    mutationFn: async (patch) => {
      const res = await api.patch<{ settings: OrgSettings }>(
        '/api/organizations/current/settings',
        patch,
      );
      return res.data.settings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORG_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export interface SignedUpload {
  url: string;
  key: string;
  expiresIn: number;
  publicUrl: string;
}

export function useSignLogoUpload() {
  return useMutation<SignedUpload, AxiosError, { contentType: string; fileSizeBytes: number }>({
    mutationFn: async (input) => {
      const res = await api.post<SignedUpload>('/api/organizations/current/logo', input);
      return res.data;
    },
  });
}
