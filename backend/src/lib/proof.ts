/**
 * Proof API client (vendor management + COI/insurance compliance).
 *
 * A thin, dependency-free fetch client mirroring `core.ts`. Proof is the
 * canonical vendor directory for bid packages and owns COI status. Every call
 * is org-scoped via `/api/v1/orgs/:orgSlug/...`; production authenticates with a
 * service bearer token, development uses the `x-helm-test-org-slug` bypass.
 *
 * See docs/proof-api-contract.md and Proof's docs/api-v1.md.
 */

import { env } from './env.js';

/** Proof's computed COI compliance enum. */
export type ProofCoiStatus = 'compliant' | 'expiring_soon' | 'expired' | 'pending' | 'none';

export interface ProofCoverage {
  type: string;
  status: ProofCoiStatus;
  expiresAt: string | null; // calendar date YYYY-MM-DD
  limit: number | null; // whole dollars
}

export interface ProofCoi {
  status: ProofCoiStatus;
  expiresAt: string | null; // earliest coverage expiry, YYYY-MM-DD
  lastRequestedAt: string | null; // ISO timestamp
  coverages?: ProofCoverage[]; // detail endpoint only
}

export interface ProofVendor {
  id: string;
  name: string;
  trade: string | null;
  email: string | null;
  phone: string | null;
  coreVendorId?: string | null;
  coi: ProofCoi;
}

export interface ProofCoiRequest {
  id: string;
  vendorId: string;
  status: 'requested' | 'fulfilled' | 'cancelled';
  coverageTypes: string[];
  requestedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class ProofApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProofApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * Auth headers for a Proof request. Production sends a service-to-service bearer
 * token; development uses the org-slug dev bypass (honored only by a Proof
 * server itself running in development mode).
 */
function proofAuthHeaders(): Record<string, string> {
  if (env.NODE_ENV === 'production') {
    return { Authorization: `Bearer ${env.PROOF_SERVICE_TOKEN}` };
  }
  return { 'x-helm-test-org-slug': env.PROOF_ORG_SLUG as string };
}

/** Throws if the vars needed to reach Proof in this environment are missing. */
function assertProofConfigured(): void {
  const missing: string[] = [];
  if (!env.PROOF_API_URL) missing.push('PROOF_API_URL');
  if (!env.PROOF_ORG_SLUG) missing.push('PROOF_ORG_SLUG');
  if (env.NODE_ENV === 'production' && !env.PROOF_SERVICE_TOKEN) {
    missing.push('PROOF_SERVICE_TOKEN');
  }
  if (missing.length > 0) {
    throw new Error(`Proof API not configured (missing: ${missing.join(', ')})`);
  }
}

async function throwFromResponse(res: Response): Promise<never> {
  // Proof errors use { error: { code, message, details } }. Fall back to raw
  // text if the body isn't the expected envelope.
  let code: string | undefined;
  let message = `Proof API ${res.status}`;
  let details: unknown;
  const body = await res.text().catch(() => '');
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: { code?: string; message?: string; details?: unknown } };
      if (parsed.error) {
        code = parsed.error.code;
        message = parsed.error.message ?? message;
        details = parsed.error.details;
      } else {
        message = `${message}: ${body}`;
      }
    } catch {
      message = `${message}: ${body}`;
    }
  }
  throw new ProofApiError(res.status, message, code, details);
}

function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`/api/v1/orgs/${env.PROOF_ORG_SLUG}${path}`, env.PROOF_API_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

// Guard against a non-JSON 200 — e.g. a consolidated Proof deploy whose SPA
// catch-all serves index.html because the /api/v1 router isn't mounted. Without
// this the caller hits a cryptic "Unexpected token '<'" JSON parse error; here
// it becomes an actionable ProofApiError.
async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ProofApiError(
      res.status,
      `Proof returned ${contentType || 'no content-type'} instead of JSON — is the /api/v1 API deployed at PROOF_API_URL?`,
      'non_json_response',
    );
  }
  return res.json() as Promise<T>;
}

async function proofGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  assertProofConfigured();
  const res = await fetch(buildUrl(path, params), { headers: proofAuthHeaders() });
  if (!res.ok) await throwFromResponse(res);
  return parseJson<T>(res);
}

async function proofPost<T>(path: string, body: unknown): Promise<T> {
  assertProofConfigured();
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { ...proofAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) await throwFromResponse(res);
  return parseJson<T>(res);
}

export interface CoiRequestInput {
  coverageTypes?: string[];
  note?: string;
  requestedByEmail?: string;
}

export const proof = {
  enabled: () => env.HELM_PROOF_INTEGRATION,

  vendors: {
    list: (params?: {
      search?: string;
      trade?: string;
      coiStatus?: string;
      cursor?: string;
      limit?: number;
    }) =>
      proofGet<PaginatedResult<ProofVendor>>('/vendors', {
        search: params?.search,
        trade: params?.trade,
        coiStatus: params?.coiStatus,
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
      }),

    get: (vendorId: string) => proofGet<{ data: ProofVendor }>(`/vendors/${vendorId}`),

    requestCoi: (vendorId: string, body?: CoiRequestInput) =>
      proofPost<{ data: ProofCoiRequest }>(`/vendors/${vendorId}/coi-requests`, body),

    listCoiRequests: (vendorId: string, params?: { cursor?: string; limit?: number }) =>
      proofGet<PaginatedResult<ProofCoiRequest>>(`/vendors/${vendorId}/coi-requests`, {
        cursor: params?.cursor,
        limit: params?.limit?.toString(),
      }),
  },
};
