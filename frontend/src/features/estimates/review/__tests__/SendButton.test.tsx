import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SendButton } from '@/features/estimates/review/SendButton';
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
    status: 'APPROVED',
    drafterId: 'u-drafter',
    reviewerId: 'u-reviewer',
    clientCompanyName: 'Acme',
    clientContactName: null,
    clientContactEmail: 'client@acme.test',
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

describe('SendButton', () => {
  it('admin sees the button on APPROVED; opens dialog with prefilled recipient + subject', async () => {
    setMe('u-admin', 'ADMIN');
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate()} />);
    const btn = await screen.findByTestId('send-estimate');
    await user.click(btn);
    const recipients = await screen.findByTestId('send-recipients');
    expect((recipients as HTMLTextAreaElement).value).toBe('client@acme.test');
    const subject = screen.getByTestId('send-subject');
    expect((subject as HTMLInputElement).value).toMatch(/MAC-26-001/);
  });

  it('does not render when status is not APPROVED', async () => {
    setMe('u-admin', 'ADMIN');
    renderInClient(<SendButton estimate={buildEstimate({ status: 'IN_REVIEW' })} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('send-estimate')).not.toBeInTheDocument();
  });

  it('PM does not see the button (role gate)', async () => {
    setMe('u-pm', 'PM');
    renderInClient(<SendButton estimate={buildEstimate()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('send-estimate')).not.toBeInTheDocument();
  });

  it('flags invalid email addresses and disables submit until they are fixed', async () => {
    setMe('u-admin', 'ADMIN');
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate({ clientContactEmail: null })} />);
    await user.click(await screen.findByTestId('send-estimate'));

    const recipients = await screen.findByTestId('send-recipients');
    await user.type(recipients, 'not-an-email');
    expect(screen.getByText(/invalid:/i)).toBeInTheDocument();
    expect(screen.getByTestId('send-submit')).toBeDisabled();

    // Replace with a valid one.
    await user.clear(recipients);
    await user.type(recipients, 'client@example.com');
    expect(screen.queryByText(/invalid:/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('send-submit')).toBeEnabled();
  });

  it('happy path: posts to /send with parsed recipients and closes the dialog on success', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: {
        estimate: { id: 'e1', status: 'SENT', sentAt: '2026-04-28T00:00:00Z' },
        snapshotId: 'snap-2',
        exportId: 'ex-2',
        sendMethod: 'email',
        downloadUrl: 'https://signed.test/x',
        email: { dispatched: true },
      },
    } as never);
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('send-estimate'));

    const recipients = await screen.findByTestId('send-recipients');
    await user.clear(recipients);
    await user.type(recipients, 'a@x.co, b@x.co');
    await user.type(screen.getByTestId('send-message'), 'See attached.');

    await user.click(screen.getByTestId('send-submit'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates/e1/send',
        expect.objectContaining({
          recipients: ['a@x.co', 'b@x.co'],
          message: 'See attached.',
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('maps invalid_status_transition to a stale-state hint and keeps the dialog open', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'invalid_status_transition', message: 'no' } },
      },
    });
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('send-estimate'));
    await user.click(screen.getByTestId('send-submit'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/refresh and try again/i);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sendMethod=link: hides recipients/subject/message, posts no recipients, shows the URL on success', async () => {
    setMe('u-admin', 'ADMIN');
    mockedPost.mockResolvedValue({
      data: {
        estimate: { id: 'e1', status: 'SENT', sentAt: '2026-04-28T00:00:00Z' },
        snapshotId: 'snap-3',
        exportId: 'ex-3',
        sendMethod: 'link',
        downloadUrl: 'https://signed.test/abc?sig=fake',
        email: null,
      },
    } as never);
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('send-estimate'));

    await user.selectOptions(await screen.findByTestId('send-method'), 'link');
    expect(screen.queryByTestId('send-recipients')).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-subject')).not.toBeInTheDocument();
    expect(screen.queryByTestId('send-message')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('send-submit'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates/e1/send',
        expect.objectContaining({ sendMethod: 'link', recipients: [] }),
      );
    });
    const url = await screen.findByTestId('send-link-url');
    expect((url as HTMLInputElement).value).toBe('https://signed.test/abc?sig=fake');
    expect(screen.getByTestId('send-link-copy')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sendMethod=download: opens the URL in a new tab and confirms the action', async () => {
    setMe('u-admin', 'ADMIN');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockedPost.mockResolvedValue({
      data: {
        estimate: { id: 'e1', status: 'SENT', sentAt: '2026-04-28T00:00:00Z' },
        snapshotId: 'snap-4',
        exportId: 'ex-4',
        sendMethod: 'download',
        downloadUrl: 'https://signed.test/dl?sig=fake',
        email: null,
      },
    } as never);
    const user = userEvent.setup();
    renderInClient(<SendButton estimate={buildEstimate()} />);
    await user.click(await screen.findByTestId('send-estimate'));

    await user.selectOptions(await screen.findByTestId('send-method'), 'download');
    await user.click(screen.getByTestId('send-submit'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates/e1/send',
        expect.objectContaining({ sendMethod: 'download' }),
      );
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed.test/dl?sig=fake',
        '_blank',
        'noopener',
      );
    });
    expect(screen.getByTestId('send-download-confirm')).toBeInTheDocument();
    openSpy.mockRestore();
  });
});
