import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CloseOutActions } from '@/features/estimates/review/CloseOutActions';
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

type Role = 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';

function meAs(id: string, role: Role) {
  return {
    user: {
      id,
      organizationId: 'o1',
      email: `${id}@x.co`,
      firstName: 'F',
      lastName: 'L',
      role,
      isActive: true,
    },
    organization: { id: 'o1', name: 'Org' },
    settings: { id: 's1' },
  };
}

function setMe(id: string, role: Role) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs(id, role) });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function buildEstimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'TI Build',
    description: null,
    status: 'SENT',
    drafterId: 'u-drafter',
    reviewerId: 'u-reviewer',
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
    sentAt: '2026-04-28T00:00:00.000Z',
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

describe('CloseOutActions', () => {
  it('admin sees all three buttons on SENT', async () => {
    setMe('u-admin', 'ADMIN');
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    expect(await screen.findByTestId('mark-won')).toBeInTheDocument();
    expect(screen.getByTestId('mark-lost')).toBeInTheDocument();
    expect(screen.getByTestId('revise-from-sent')).toBeInTheDocument();
  });

  it('renders nothing when status is not SENT', async () => {
    setMe('u-admin', 'ADMIN');
    renderInClient(<CloseOutActions estimate={buildEstimate({ status: 'APPROVED' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('mark-won')).not.toBeInTheDocument();
  });

  it('PM does not see the buttons (role gate)', async () => {
    setMe('u-pm', 'PM');
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('mark-won')).not.toBeInTheDocument();
  });

  it('Mark won posts immediately to /mark-won', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'WON' }, reviewAction: { id: 'ra' } },
    } as never);
    const user = userEvent.setup();
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('mark-won'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/mark-won', {});
    });
  });

  it('Mark lost opens a dialog that requires a non-empty reason before posting', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'LOST' }, reviewAction: { id: 'ra' } },
    } as never);
    const user = userEvent.setup();
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('mark-lost'));

    const submit = await screen.findByTestId('closeout-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('closeout-input'), 'Client picked another GC');
    await user.click(submit);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/mark-lost', {
        lostReason: 'Client picked another GC',
      });
    });
  });

  it('Revise opens a dialog (note optional) and posts to /revise', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'REVISED' }, reviewAction: { id: 'ra' } },
    } as never);
    const user = userEvent.setup();
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('revise-from-sent'));

    // note optional — submit enabled even with no input
    const submit = screen.getByTestId('closeout-submit');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/revise', { note: null });
    });
  });

  it('maps invalid_status_transition to a refresh hint and keeps the dialog open', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'invalid_status_transition', message: 'no' } },
      },
    });
    const user = userEvent.setup();
    renderInClient(<CloseOutActions estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('mark-lost'));
    await user.type(screen.getByTestId('closeout-input'), 'reason');
    await user.click(screen.getByTestId('closeout-submit'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/refresh and try again/i);
    });
    expect(screen.getByTestId('closeout-dialog')).toBeInTheDocument();
  });
});
