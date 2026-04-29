import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';

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
const mockedPatch = vi.mocked(api.patch);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
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

function setupApi(opts: {
  unread?: number;
  notifications?: unknown[];
} = {}) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url === '/api/notifications/unread-count')
      return Promise.resolve({ data: { unreadCount: opts.unread ?? 0 } });
    if (url.startsWith('/api/notifications'))
      return Promise.resolve({ data: { notifications: opts.notifications ?? [] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderInClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchInterval: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/estimates']}>
          <Routes>
            <Route path="/app/estimates" element={<NotificationBell />} />
            <Route
              path="/app/estimates/:id"
              element={<div data-testid="navigated">on estimate page</div>}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  it('shows the unread count badge when count > 0', async () => {
    setupApi({ unread: 3 });
    renderInClient();
    await waitFor(() => {
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
    });
  });

  it('hides the badge when there are no unread notifications', async () => {
    setupApi({ unread: 0 });
    renderInClient();
    await waitFor(() => screen.getByTestId('notification-bell'));
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('caps the badge at 99+', async () => {
    setupApi({ unread: 250 });
    renderInClient();
    await waitFor(() => {
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+');
    });
  });

  it('opens the panel and lists notifications on click', async () => {
    setupApi({
      unread: 1,
      notifications: [
        {
          id: 'n-1',
          organizationId: 'o1',
          recipientId: 'u1',
          type: 'REVIEW_REQUESTED',
          title: 'Estimate MAC-26-001 submitted for review',
          body: null,
          entityType: 'Estimate',
          entityId: 'e1',
          emailSent: false,
          emailSentAt: null,
          readAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
    });
    const user = userEvent.setup();
    renderInClient();
    await user.click(await screen.findByTestId('notification-bell'));
    expect(await screen.findByTestId('notification-panel')).toBeInTheDocument();
    const items = await screen.findAllByTestId('notification-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toMatch(/MAC-26-001/);
  });

  it('clicking an Estimate notification marks it read and navigates', async () => {
    setupApi({
      unread: 1,
      notifications: [
        {
          id: 'n-1',
          organizationId: 'o1',
          recipientId: 'u1',
          type: 'REVIEW_REQUESTED',
          title: 'Review me',
          body: null,
          entityType: 'Estimate',
          entityId: 'e1',
          emailSent: false,
          emailSentAt: null,
          readAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
    });
    mockedPatch.mockResolvedValue({
      data: {
        notification: {
          id: 'n-1',
          readAt: '2026-04-28T00:00:01.000Z',
        },
      },
    } as never);

    const user = userEvent.setup();
    renderInClient();
    await user.click(await screen.findByTestId('notification-bell'));
    await user.click(await screen.findByTestId('notification-item'));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalled();
    });
    expect(mockedPatch.mock.calls[0]?.[0]).toBe('/api/notifications/n-1');
    await waitFor(() => {
      expect(screen.getByTestId('navigated')).toBeInTheDocument();
    });
  });

  it('Mark all read posts /read-all', async () => {
    setupApi({
      unread: 2,
      notifications: [
        {
          id: 'n-1',
          organizationId: 'o1',
          recipientId: 'u1',
          type: 'REVIEW_APPROVED',
          title: 'Approved',
          body: null,
          entityType: 'Estimate',
          entityId: 'e1',
          emailSent: false,
          emailSentAt: null,
          readAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
        },
      ],
    });
    mockedPost.mockResolvedValue({ data: { count: 2 } } as never);
    const user = userEvent.setup();
    renderInClient();
    await user.click(await screen.findByTestId('notification-bell'));
    await user.click(await screen.findByTestId('notification-read-all'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/notifications/read-all');
    });
  });
});
