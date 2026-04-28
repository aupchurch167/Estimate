import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ReviewerActions,
  SubmitForReviewButton,
  UnlockButton,
} from '@/features/estimates/review/ReviewActions';
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
    title: 'Sample',
    description: null,
    status: 'DRAFT',
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

// ─── SubmitForReviewButton ────────────────────────────────────────────────

describe('SubmitForReviewButton', () => {
  it('drafter (ESTIMATOR) sees the button on a DRAFT and submits', async () => {
    setMe('u-drafter', 'ESTIMATOR');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'IN_REVIEW' }, reviewAction: { id: 'ra-1' } },
    } as never);

    const user = userEvent.setup();
    renderInClient(<SubmitForReviewButton estimate={buildEstimate()} />);

    const btn = await screen.findByTestId('submit-for-review');
    expect(btn).toHaveTextContent(/submit for review/i);
    await user.click(btn);
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/submit', {});
    });
  });

  it('label flips to "Resubmit for review" when the estimate is REVISED', async () => {
    setMe('u-drafter', 'ESTIMATOR');
    renderInClient(<SubmitForReviewButton estimate={buildEstimate({ status: 'REVISED' })} />);
    const btn = await screen.findByTestId('submit-for-review');
    expect(btn).toHaveTextContent(/resubmit/i);
  });

  it('does not render for a non-drafter ESTIMATOR (the reviewer)', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    renderInClient(<SubmitForReviewButton estimate={buildEstimate()} />);
    // wait for /me to resolve
    await screen.findByText('', { selector: 'body' }).catch(() => null);
    expect(screen.queryByTestId('submit-for-review')).not.toBeInTheDocument();
  });

  it('does not render once the estimate is IN_REVIEW', async () => {
    setMe('u-drafter', 'ESTIMATOR');
    renderInClient(<SubmitForReviewButton estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('submit-for-review')).not.toBeInTheDocument();
  });

  it('admin sees the button regardless of relationship', async () => {
    setMe('u-admin', 'ADMIN');
    renderInClient(<SubmitForReviewButton estimate={buildEstimate()} />);
    expect(await screen.findByTestId('submit-for-review')).toBeInTheDocument();
  });
});

// ─── ReviewerActions ──────────────────────────────────────────────────────

describe('ReviewerActions', () => {
  it('reviewer can approve an IN_REVIEW estimate', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'APPROVED' }, reviewAction: { id: 'ra' } },
    } as never);

    const user = userEvent.setup();
    renderInClient(<ReviewerActions estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await user.click(await screen.findByTestId('approve-estimate'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/approve', {});
    });
  });

  it('Request-changes opens a modal that requires a non-empty note before posting', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'REVISED' }, reviewAction: { id: 'ra' } },
    } as never);

    const user = userEvent.setup();
    renderInClient(<ReviewerActions estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await user.click(await screen.findByTestId('request-changes'));

    const modal = await screen.findByTestId('note-dialog');
    expect(modal).toBeInTheDocument();

    const submit = screen.getByTestId('note-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('note-input'), 'tighten the demo numbers');
    await user.click(submit);

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/request-changes', {
        note: 'tighten the demo numbers',
      });
    });
  });

  it('drafter does not see reviewer actions on their own IN_REVIEW estimate', async () => {
    setMe('u-drafter', 'ESTIMATOR');
    renderInClient(<ReviewerActions estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('approve-estimate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-changes')).not.toBeInTheDocument();
  });

  it('renders nothing when the estimate is not IN_REVIEW', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    renderInClient(<ReviewerActions estimate={buildEstimate({ status: 'DRAFT' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('approve-estimate')).not.toBeInTheDocument();
  });

  it('maps invalid_status_transition to a stale-state hint', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    mockedPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'invalid_status_transition', message: 'no' } },
      },
    });

    const user = userEvent.setup();
    renderInClient(<ReviewerActions estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await user.click(await screen.findByTestId('approve-estimate'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/refresh and try again/i);
    });
  });
});

// ─── UnlockButton ─────────────────────────────────────────────────────────

describe('UnlockButton', () => {
  it('admin sees Unlock on an APPROVED estimate; submitting posts to /unlock', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: { estimate: { id: 'e1', status: 'REVISED' }, reviewAction: { id: 'ra' } },
    } as never);
    const user = userEvent.setup();
    renderInClient(<UnlockButton estimate={buildEstimate({ status: 'APPROVED' })} />);
    await user.click(await screen.findByTestId('unlock-estimate'));
    await user.click(screen.getByTestId('note-submit'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/unlock', { note: null });
    });
  });

  it('non-admin (ESTIMATOR reviewer) does not see the button', async () => {
    setMe('u-reviewer', 'ESTIMATOR');
    renderInClient(<UnlockButton estimate={buildEstimate({ status: 'APPROVED' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('unlock-estimate')).not.toBeInTheDocument();
  });

  it('does not render when status is not APPROVED', async () => {
    setMe('u-admin', 'ADMIN');
    renderInClient(<UnlockButton estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('unlock-estimate')).not.toBeInTheDocument();
  });
});
