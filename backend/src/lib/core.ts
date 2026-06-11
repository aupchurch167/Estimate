import { env } from './env.js';

export interface CoreAccount {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  industry: string | null;
  status: string;
}

export interface CoreDeal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  accountId: string;
}

export interface CoreVendor {
  id: string;
  name: string;
  trade: string | null;
  complianceStatus: string | null;
  email: string | null;
  phone: string | null;
}

export interface CoreProject {
  id: string;
  name: string;
  status: string | null;
  accountId: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class CoreApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CoreApiError';
  }
}

async function coreGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  if (!env.CORE_API_URL || !env.CORE_ORG_SLUG || !env.CORE_DEV_USER_ID) {
    throw new Error('Core API not configured');
  }
  const url = new URL(`/api/v1/orgs/${env.CORE_ORG_SLUG}${path}`, env.CORE_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      'x-helm-test-user-id': env.CORE_DEV_USER_ID,
      'x-helm-test-org-slug': env.CORE_ORG_SLUG,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new CoreApiError(res.status, `Core API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function corePost<T>(path: string, body: unknown): Promise<T> {
  if (!env.CORE_API_URL || !env.CORE_ORG_SLUG || !env.CORE_DEV_USER_ID) {
    throw new Error('Core API not configured');
  }
  const url = new URL(`/api/v1/orgs/${env.CORE_ORG_SLUG}${path}`, env.CORE_API_URL);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'x-helm-test-user-id': env.CORE_DEV_USER_ID,
      'x-helm-test-org-slug': env.CORE_ORG_SLUG,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CoreApiError(res.status, `Core API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function corePatch<T>(path: string, body: unknown): Promise<T> {
  if (!env.CORE_API_URL || !env.CORE_ORG_SLUG || !env.CORE_DEV_USER_ID) {
    throw new Error('Core API not configured');
  }
  const url = new URL(`/api/v1/orgs/${env.CORE_ORG_SLUG}${path}`, env.CORE_API_URL);
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      'x-helm-test-user-id': env.CORE_DEV_USER_ID,
      'x-helm-test-org-slug': env.CORE_ORG_SLUG,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CoreApiError(res.status, `Core API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const core = {
  enabled: () => env.HELM_CORE_INTEGRATION,

  accounts: {
    list: (params?: { search?: string; cursor?: string; limit?: number }) =>
      coreGet<PaginatedResult<CoreAccount>>('/accounts', {
        search: params?.search,
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
      }),
    get: (id: string) => coreGet<{ data: CoreAccount }>(`/accounts/${id}`),
  },

  deals: {
    list: (params?: { search?: string; cursor?: string; limit?: number; accountId?: string; outcome?: string }) =>
      coreGet<PaginatedResult<CoreDeal>>('/deals', {
        search: params?.search,
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
        accountId: params?.accountId,
        outcome: params?.outcome,
      }),
    get: (id: string) => coreGet<{ data: CoreDeal }>(`/deals/${id}`),
    update: (id: string, body: Record<string, unknown>) =>
      corePatch<{ data: CoreDeal }>(`/deals/${id}`, body),
  },

  vendors: {
    list: (params?: { search?: string; cursor?: string; limit?: number; complianceStatus?: string }) =>
      coreGet<PaginatedResult<CoreVendor>>('/vendors', {
        search: params?.search,
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
        complianceStatus: params?.complianceStatus,
      }),
    get: (id: string) => coreGet<{ data: CoreVendor }>(`/vendors/${id}`),
  },

  projects: {
    list: (params?: { search?: string; cursor?: string; limit?: number; accountId?: string }) =>
      coreGet<PaginatedResult<CoreProject>>('/projects', {
        search: params?.search,
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
        accountId: params?.accountId,
      }),
    get: (id: string) => coreGet<{ data: CoreProject }>(`/projects/${id}`),
    create: (body: Record<string, unknown>) =>
      corePost<{ data: { id: string } }>('/projects', body),
  },
};
