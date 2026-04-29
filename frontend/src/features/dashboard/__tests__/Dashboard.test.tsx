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
    winRate: null,
    avgDaysInPipeline: null,
    activePipelineValue: '0',
  },
  needsAttention: [],
  assignedReviews: [],
  myDrafts: [],
  recentActivity: [],
  aiUsage: null,
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
        winRate: 0.5,
        avgDaysInPipeline: 4.2,
        activePipelineValue: '60000',
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

  it('surfaces an in-review estimate in Needs Attention with a Review CTA', async () => {
    setupApi({
      ...emptyDashboard,
      needsAttention: [
        {
          id: 'e-1',
          number: 'MAC-26-001',
          title: 'Acme TI',
          status: 'IN_REVIEW',
          clientCompanyName: 'Acme',
          totalSellPrice: '8400',
          updatedAt: '2026-04-28T00:00:00.000Z',
          reason: 'awaiting_my_review',
          ageDays: 1,
        },
      ],
    });
    renderInClient();
    const rows = await screen.findAllByTestId('needs-attention-row');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.getAttribute('data-reason')).toBe('awaiting_my_review');
    expect(row.textContent).toMatch(/MAC-26-001/);
    expect(row.textContent).toMatch(/Acme TI/);
    expect(row.textContent).toMatch(/\$8,400/);
    expect(row.textContent).toMatch(/Review/);
    const link = row.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/app/estimates/e-1');
  });

  it('shows "Nothing waiting on you." when needsAttention is empty', async () => {
    setupApi(emptyDashboard);
    renderInClient();
    expect(await screen.findByText(/nothing waiting on you/i)).toBeInTheDocument();
  });

  it('renders KPI tiles for active pipeline / win rate / avg days / won this month', async () => {
    setupApi({
      ...emptyDashboard,
      pipeline: {
        ...emptyDashboard.pipeline,
        activePipelineValue: '60000',
        winRate: 0.6,
        avgDaysInPipeline: 7.5,
        wonThisMonthSellPrice: '12000',
        wonThisMonthCount: 2,
      },
    });
    renderInClient();
    const kpis = await screen.findByTestId('dashboard-kpis');
    expect(kpis.textContent).toMatch(/\$60,000/);
    expect(kpis.textContent).toMatch(/60%/);
    expect(kpis.textContent).toMatch(/7\.5/);
    expect(kpis.textContent).toMatch(/\$12,000/);
    expect(kpis.textContent).toMatch(/2 estimates/);
  });

  it('shows em dashes when winRate / avgDaysInPipeline are null', async () => {
    setupApi(emptyDashboard);
    renderInClient();
    const kpis = await screen.findByTestId('dashboard-kpis');
    // Two em dashes — one for win rate, one for avg days.
    expect(kpis.textContent?.match(/—/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the admin AI Usage card when aiUsage payload is present', async () => {
    setupApi({
      ...emptyDashboard,
      aiUsage: {
        monthToDateUsd: '12.50',
        monthToDateRunCount: 24,
        capUsd: '50.00',
        byUser: [
          {
            userId: 'u-a',
            firstName: 'Adam',
            lastName: 'Mark',
            email: 'a@b.c',
            runCount: 18,
            costUsd: '10.00',
          },
          {
            userId: 'u-b',
            firstName: 'Sam',
            lastName: 'P',
            email: 's@x',
            runCount: 6,
            costUsd: '2.50',
          },
        ],
      },
    });
    renderInClient();
    const card = await screen.findByTestId('dashboard-ai-usage');
    expect(card.textContent).toMatch(/AI usage/);
    expect(card.textContent).toMatch(/\$13 spent/);
    expect(card.textContent).toMatch(/\$50 cap/);
    expect(card.textContent).toMatch(/24 runs/);
    expect(card.textContent).toMatch(/Adam Mark/);
    expect(card.textContent).toMatch(/Sam P/);
    expect(screen.getByTestId('ai-usage-bar').getAttribute('data-pct')).toBe('25');
  });

  it('hides the AI Usage card for non-admins', async () => {
    setupApi(emptyDashboard);
    renderInClient();
    await screen.findByTestId('dashboard-pipeline');
    expect(screen.queryByTestId('dashboard-ai-usage')).not.toBeInTheDocument();
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
