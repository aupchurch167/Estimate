import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportPdfButton } from '@/features/estimates/review/ExportPdfButton';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { EstimateDetail } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

function meAs() {
  return {
    user: {
      id: 'u1',
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'A',
      lastName: 'M',
      role: 'OWNER',
      isActive: true,
    },
    organization: { id: 'o1', name: 'Org' },
    settings: { id: 's1' },
  };
}

function buildEstimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'Sample',
    description: null,
    status: 'APPROVED',
    drafterId: 'u1',
    reviewerId: null,
    clientCompanyName: null,
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

function setupApi(snapshots: unknown[]) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url.endsWith('/snapshots')) return Promise.resolve({ data: { snapshots } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderInClient(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>{node}</AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ExportPdfButton', () => {
  it('disables the button until at least one snapshot exists', async () => {
    setupApi([]);
    renderInClient(<ExportPdfButton estimate={buildEstimate()} />);
    const btn = await screen.findByTestId('export-pdf');
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.getAttribute('title')).toMatch(/approve.*first/i);
  });

  it('enabled once a snapshot exists; clicking POSTs and opens the signed URL in a new tab', async () => {
    setupApi([
      {
        id: 'snap-1',
        estimateId: 'e1',
        snapshotType: 'APPROVAL',
        sequence: 1,
        createdById: 'u1',
        totalCost: '0',
        totalMarkup: '0',
        totalSellPrice: '0',
        createdAt: '2026-04-28T00:00:00.000Z',
      },
    ]);
    mockedPost.mockResolvedValue({
      data: {
        export: {
          id: 'ex-1',
          estimateId: 'e1',
          snapshotId: 'snap-1',
          exportedById: 'u1',
          format: 'PDF',
          fileSizeBytes: 1234,
          createdAt: '2026-04-28T00:00:01.000Z',
          downloadUrl: 'https://signed.test/exports/o1/e1/snap-1/abc.pdf',
        },
        downloadUrl: 'https://signed.test/exports/o1/e1/snap-1/abc.pdf',
      },
    } as never);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const user = userEvent.setup();
    renderInClient(<ExportPdfButton estimate={buildEstimate()} />);
    const btn = await screen.findByTestId('export-pdf');
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/exports', { format: 'PDF' });
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed.test/exports/o1/e1/snap-1/abc.pdf',
        '_blank',
        'noopener',
      );
    });
    openSpy.mockRestore();
  });

  it('maps no_snapshot_to_export to a friendly message', async () => {
    setupApi([
      {
        id: 'snap-1',
        estimateId: 'e1',
        snapshotType: 'APPROVAL',
        sequence: 1,
        createdById: 'u1',
        totalCost: '0',
        totalMarkup: '0',
        totalSellPrice: '0',
        createdAt: '2026-04-28T00:00:00.000Z',
      },
    ]);
    mockedPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: {
            code: 'no_snapshot_to_export',
            message: 'no snap',
          },
        },
      },
    });
    const user = userEvent.setup();
    renderInClient(<ExportPdfButton estimate={buildEstimate()} />);
    const btn = await screen.findByTestId('export-pdf');
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/approve.*first/i);
    });
  });
});
