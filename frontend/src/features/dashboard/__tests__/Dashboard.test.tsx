import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { DashboardPayload } from '@/features/dashboard/types';

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

function meAs() {
  return {
    user: {
      id: 'u1',
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'Adam',
      lastName: 'M',
      role: 'OWNER',
      isActive: true,
    },
    organization: { id: 'o1', name: 'Org' },
    settings: { id: 's1' },
  };
}

const emptyDashboard: DashboardPayload = {
  pipeline: {
    counts: {
      DRAFT: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      SENT: 0,
      WON: 0,
      LOST: 0,
      REVISED: 0,
    },
    totalApprovedSellPrice: '0',
    totalSentSellPrice: '0',
    wonThisMonthSellPrice: '0',
    wonThisMonthCount: 0,
  },
  assignedReviews: [],
  myDrafts: [],
  recentActivity: [],
};

function setupApi(payload: DashboardPayload | (() => Promise<DashboardPayload>)) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url === '/api/dashboard') {
      const data = typeof payload === 'function' ? payload() : payload;
      return Promise.resolve({ data });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function renderInClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  it('pipeline cells link to the estimates list filtered by status', async () => {
    setupApi({
      ...emptyDashboard,
      pipeline: {
        ...emptyDashboard.pipeline,
        counts: { ...emptyDashboard.pipeline.counts, IN_REVIEW: 2 },
      },
    });
    renderInClient();
    const cell = await screen.findByTestId('pipeline-cell-IN_REVIEW');
    expect(cell.getAttribute('href')).toBe('/app/estimates?status=IN_REVIEW');
  });

  it('renders pipeline counts and the dollar summary line', async () => {
    setupApi({
      ...emptyDashboard,
      pipeline: {
        counts: {
          DRAFT: 3,
          IN_REVIEW: 1,
          APPROVED: 2,
          SENT: 4,
          WON: 1,
          LOST: 0,
          REVISED: 1,
        },
        totalApprovedSellPrice: '12000',
        totalSentSellPrice: '34500',
        wonThisMonthSellPrice: '5000',
        wonThisMonthCount: 1,
      },
    });
    renderInClient();
    await waitFor(() => screen.getByTestId('dashboard-pipeline'));
    const strip = screen.getByTestId('dashboard-pipeline');
    expect(strip.textContent).toMatch(/\$12,000 approved/);
    expect(strip.textContent).toMatch(/\$34,500 sent/);
    expect(strip.textContent).toMatch(/\$5,000 won this month/);
    // Counts visible as the big tabular numbers.
    expect(strip.textContent).toMatch(/Drafts/);
    expect(strip.textContent).toMatch(/3/);
  });

  it('lists assigned reviews and links to the estimate', async () => {
    setupApi({
      ...emptyDashboard,
      assignedReviews: [
        {
          id: 'e-1',
          number: 'MAC-26-001',
          title: 'Acme TI',
          status: 'IN_REVIEW',
          clientCompanyName: 'Acme',
          totalSellPrice: '8400',
          updatedAt: '2026-04-28T00:00:00.000Z',
          drafter: null,
          reviewer: null,
        },
      ],
    });
    renderInClient();
    const rows = await screen.findAllByTestId('dashboard-estimate-row');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.textContent).toMatch(/MAC-26-001/);
    expect(row.textContent).toMatch(/Acme TI/);
    expect(row.textContent).toMatch(/\$8,400/);
    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/app/estimates/e-1');
  });

  it('shows "Nothing waiting on you." when assignedReviews is empty', async () => {
    setupApi(emptyDashboard);
    renderInClient();
    expect(await screen.findByText(/nothing waiting on you/i)).toBeInTheDocument();
  });

  it('renders recent activity newest-first with actor + estimate link', async () => {
    setupApi({
      ...emptyDashboard,
      recentActivity: [
        {
          id: 'a-2',
          eventType: 'ESTIMATE_APPROVED',
          summary: 'Approved estimate MAC-26-001',
          createdAt: '2026-04-28T01:00:00.000Z',
          estimate: { id: 'e-1', number: 'MAC-26-001' },
          actor: { id: 'u1', firstName: 'Adam', lastName: 'M' },
        },
        {
          id: 'a-1',
          eventType: 'ESTIMATE_SUBMITTED_FOR_REVIEW',
          summary: 'Submitted estimate MAC-26-001 for review',
          createdAt: '2026-04-28T00:00:00.000Z',
          estimate: { id: 'e-1', number: 'MAC-26-001' },
          actor: null,
        },
      ],
    });
    renderInClient();
    const rows = await screen.findAllByTestId('dashboard-activity-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toMatch(/Approved/);
    expect(rows[1]?.textContent).toMatch(/Submitted/);
    // System actor when actor is null.
    expect(rows[1]?.textContent).toMatch(/System/);
  });

  it('renders an error banner when the request fails', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
      return Promise.reject({
        isAxiosError: true,
        response: { status: 500, data: { error: { code: 'oops', message: 'boom' } } },
      });
    });
    renderInClient();
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toMatch(/dashboard|boom/i);
  });
});
