import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiUsageSection } from '@/features/settings/AiUsageSection';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { AiUsagePayload } from '@/features/settings/useAiUsage';

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

const empty: AiUsagePayload = {
  capUsd: '100',
  monthToDateUsd: '0',
  monthToDateRunCount: 0,
  windowDays: 30,
  byUser: [],
  byEstimate: [],
  dailySeries: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-04-${String((i % 30) + 1).padStart(2, '0')}`,
    costUsd: '0',
    runCount: 0,
  })),
  recentRuns: [],
};

function setupApi(payload: AiUsagePayload | (() => Promise<never>)) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url === '/api/ai-runs/usage') {
      if (typeof payload === 'function') return payload();
      return Promise.resolve({ data: payload });
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
          <AiUsageSection />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AiUsageSection', () => {
  it('shows MTD spend, cap, and a 0% bar when no spend yet', async () => {
    setupApi(empty);
    const { container } = renderInClient();
    await waitFor(() => screen.getByTestId('ai-usage-cap-bar'));
    expect(screen.getByText(/0 runs this month/i)).toBeInTheDocument();
    // Cap line is split across nodes — check the section text as a whole.
    expect(container.textContent).toMatch(/\$0\.00.*\$100\.00 cap/);
    expect(screen.getByText(/0% of cap used/i)).toBeInTheDocument();
  });

  it('reflects "/ unlimited" when capUsd is null', async () => {
    setupApi({ ...empty, capUsd: null });
    renderInClient();
    await waitFor(() => screen.getByText(/0 runs this month/i));
    expect(screen.getByText(/\/ unlimited/i)).toBeInTheDocument();
    // No bar when there's no cap.
    expect(screen.queryByTestId('ai-usage-cap-bar')).not.toBeInTheDocument();
  });

  it('renders top users + top estimates and the recent runs list, including a FAILED row with errorMessage', async () => {
    const payload: AiUsagePayload = {
      ...empty,
      monthToDateUsd: '12.34',
      monthToDateRunCount: 5,
      capUsd: '100',
      byUser: [
        {
          userId: 'u-other',
          firstName: 'Sam',
          lastName: 'P',
          email: 'sam@x.co',
          costUsd: '8.00',
          runCount: 3,
        },
      ],
      byEstimate: [
        {
          estimateId: 'e-1',
          number: 'MAC-26-001',
          title: 'Acme TI',
          costUsd: '8.00',
          runCount: 3,
        },
      ],
      dailySeries: [
        ...Array.from({ length: 29 }, (_, i) => ({
          date: `2026-04-${String(i + 1).padStart(2, '0')}`,
          costUsd: '0',
          runCount: 0,
        })),
        { date: '2026-04-30', costUsd: '12.34', runCount: 5 },
      ],
      recentRuns: [
        {
          id: 'r-2',
          runType: 'GENERATE_LINE_ITEMS',
          status: 'FAILED',
          modelVersion: 'claude-sonnet-4-6',
          costUsd: '0.05',
          tokensInput: 100,
          tokensOutput: 0,
          durationMs: 800,
          errorMessage: 'invalid x-api-key',
          createdAt: '2026-04-30T00:01:00.000Z',
          completedAt: '2026-04-30T00:01:01.000Z',
          estimate: { id: 'e-1', number: 'MAC-26-001', title: 'Acme TI' },
          triggeredBy: {
            id: 'u-other',
            firstName: 'Sam',
            lastName: 'P',
            email: 'sam@x.co',
          },
        },
        {
          id: 'r-1',
          runType: 'GENERATE_LINE_ITEMS',
          status: 'SUCCEEDED',
          modelVersion: 'claude-sonnet-4-6',
          costUsd: '0.50',
          tokensInput: 1000,
          tokensOutput: 500,
          durationMs: 1500,
          errorMessage: null,
          createdAt: '2026-04-30T00:00:00.000Z',
          completedAt: '2026-04-30T00:00:01.000Z',
          estimate: { id: 'e-1', number: 'MAC-26-001', title: 'Acme TI' },
          triggeredBy: null,
        },
      ],
    };
    setupApi(payload);
    renderInClient();

    await waitFor(() => screen.getByTestId('ai-usage-cap-bar'));

    // Top user row.
    const userRows = screen.getAllByTestId('ai-usage-user-row');
    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.textContent).toMatch(/Sam P/);
    expect(userRows[0]?.textContent).toMatch(/\$8\.00/);

    // Top estimate row links.
    const estRows = screen.getAllByTestId('ai-usage-estimate-row');
    expect(estRows).toHaveLength(1);
    expect(estRows[0]?.querySelector('a')?.getAttribute('href')).toBe(
      '/app/estimates/e-1',
    );

    // Recent rows include the FAILED with errorMessage surfaced.
    const recentRows = screen.getAllByTestId('ai-usage-recent-row');
    expect(recentRows).toHaveLength(2);
    const failed = recentRows.find((r) => r.dataset.status === 'FAILED')!;
    expect(failed.textContent).toMatch(/invalid x-api-key/);

    // Sparkline rendered.
    expect(screen.getByTestId('ai-usage-sparkline')).toBeInTheDocument();
  });

  it('renders an error banner when the request fails', async () => {
    setupApi(() =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 403, data: { error: { code: 'forbidden', message: 'no' } } },
      }),
    );
    renderInClient();
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toMatch(/usage|no/i);
  });
});
