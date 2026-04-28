import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { EstimateWorkspace } from '@/pages/EstimateWorkspace';
import { api } from '@/lib/api';
import type { EstimateDetail, EstimateStatus } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

beforeEach(() => {
  mockedGet.mockReset();
});

function buildEstimate(status: EstimateStatus, overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'Sample TI',
    description: null,
    status,
    drafterId: 'u1',
    reviewerId: null,
    clientCompanyName: 'Acme',
    clientContactName: null,
    clientContactEmail: null,
    clientContactPhone: null,
    projectAddressLine1: null,
    projectAddressLine2: null,
    projectCity: null,
    projectState: null,
    projectPostalCode: null,
    totalCost: '0',
    totalMarkup: '0',
    totalSellPrice: '0',
    validUntil: null,
    sentAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    scopeSections: [],
    lineItems: [],
    sourceInputs: [],
    conversation: null,
    ...overrides,
  };
}

function meAs(opts: { role?: string; id?: string } = {}) {
  return {
    user: {
      id: opts.id ?? 'u1',
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'Adam',
      lastName: 'Mark',
      role: opts.role ?? 'OWNER',
      isActive: true,
    },
    organization: { id: 'o1', name: 'Mark Allan' },
    settings: { id: 's1' },
  };
}

function setupApi(estimate: EstimateDetail | null, error?: { status: number }) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url.startsWith('/api/estimates/')) {
      if (error) {
        return Promise.reject({ isAxiosError: true, response: error });
      }
      if (estimate) return Promise.resolve({ data: { estimate } });
      return Promise.reject({ isAxiosError: true, response: { status: 404 } });
    }
    return Promise.reject(new Error(`unexpected: ${url}`));
  });
}

function renderAt(id: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/app/estimates/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/app/estimates/:id" element={<EstimateWorkspace />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EstimateWorkspace mode selection', () => {
  it('DRAFT renders Draft Mode (3-panel) with Submit for review action', async () => {
    setupApi(buildEstimate('DRAFT'));
    renderAt('e1');
    await waitFor(() => screen.getByText(/^A · Sources$/));
    expect(screen.getByText(/^B · Draft Session$/)).toBeInTheDocument();
    expect(screen.getByText(/^C · Schedule$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument();
  });

  it('REVISED also renders Draft Mode but labels the mode as Revising', async () => {
    setupApi(buildEstimate('REVISED'));
    renderAt('e1');
    await waitFor(() => screen.getByText(/^A · Sources$/));
    expect(screen.getByText(/Revising/)).toBeInTheDocument();
  });

  it('IN_REVIEW renders Review Mode with Approve + Request changes', async () => {
    setupApi(buildEstimate('IN_REVIEW'));
    renderAt('e1');
    await waitFor(() => screen.getByText(/Schedule of Values/));
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument();
  });

  it('SENT renders Review Mode read-only with Lease won / Lease lost / Revise', async () => {
    setupApi(buildEstimate('SENT'));
    renderAt('e1');
    await waitFor(() => screen.getByText(/Sent · Read-only/));
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lease won/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lease lost/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^revise$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Approve$/ })).not.toBeInTheDocument();
  });

  it('APPROVED renders read-only with Send to client', async () => {
    setupApi(buildEstimate('APPROVED'));
    renderAt('e1');
    await waitFor(() => screen.getByText(/Approved · Read-only/));
    expect(screen.getByRole('button', { name: /send to client/i })).toBeInTheDocument();
  });

  it('reviewer of a DRAFT can toggle into a read-only review peek and back', async () => {
    setupApi(buildEstimate('DRAFT', { reviewerId: 'reviewer-u' }));
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: meAs({ id: 'reviewer-u' }) });
      if (url.startsWith('/api/estimates/')) {
        return Promise.resolve({
          data: { estimate: buildEstimate('DRAFT', { reviewerId: 'reviewer-u' }) },
        });
      }
      return Promise.reject(new Error(`unexpected: ${url}`));
    });

    const user = userEvent.setup();
    renderAt('e1');
    await waitFor(() => screen.getByText(/^A · Sources$/));
    expect(screen.getByRole('button', { name: /peek as reviewer/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /peek as reviewer/i }));
    await waitFor(() => {
      expect(screen.getByText(/Schedule of Values/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /back to draft/i })).toBeInTheDocument();
  });

  it('renders a Not-found state for 404', async () => {
    setupApi(null, { status: 404 });
    renderAt('missing');
    await waitFor(() => {
      expect(screen.getByText(/that estimate doesn't exist/i)).toBeInTheDocument();
    });
  });
});
