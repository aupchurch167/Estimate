import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RightRail } from '@/features/estimates/review/RightRail';
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
const mockedPatch = vi.mocked(api.patch);
const mockedDelete = vi.mocked(api.delete);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

function meAs(id = 'u1', role: 'OWNER' | 'ESTIMATOR' = 'OWNER') {
  return {
    user: {
      id,
      organizationId: 'o1',
      email: 'a@b.c',
      firstName: 'Adam',
      lastName: 'Mark',
      role,
      isActive: true,
    },
    organization: { id: 'o1', name: 'Mark Allan' },
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
    status: 'IN_REVIEW',
    drafterId: 'u-drafter',
    reviewerId: 'u1',
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
    scopeSections: [
      {
        id: 'sec-1',
        estimateId: 'e1',
        name: 'Demolition',
        description: null,
        order: 0,
        markupPercent: null,
      },
    ],
    lineItems: [
      {
        id: 'li-1',
        estimateId: 'e1',
        scopeSectionId: 'sec-1',
        description: 'Demo back wall',
        quantity: '1',
        unitOfMeasure: 'LS',
        unitCostMaterial: '0',
        unitCostLabor: '0',
        markupPercent: '0',
        lineCost: '0',
        lineSellPrice: '0',
        status: 'NEEDS_REVIEW',
        source: 'AI_GENERATED',
        aiConfidence: '0.55',
        aiAssumption: 'Wall is non-structural — confirm with PM.',
        order: 0,
      },
      {
        id: 'li-2',
        estimateId: 'e1',
        scopeSectionId: 'sec-1',
        description: 'Custom soffit',
        quantity: '1',
        unitOfMeasure: 'LS',
        unitCostMaterial: '0',
        unitCostLabor: '0',
        markupPercent: '0',
        lineCost: '0',
        lineSellPrice: '0',
        status: 'NO_PRICE',
        source: 'AI_GENERATED',
        aiConfidence: '0.5',
        aiAssumption: null,
        order: 1,
      },
    ],
    sourceInputs: [],
    conversation: null,
    ...overrides,
  };
}

function setupApi(opts: {
  comments?: unknown[];
  events?: unknown[];
  postReply?: () => Promise<{ data: unknown }> | { data: unknown };
  patchReply?: () => Promise<{ data: unknown }> | { data: unknown };
  deleteReply?: () => Promise<{ data: unknown }> | { data: unknown };
} = {}) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs() });
    if (url.endsWith('/comments')) return Promise.resolve({ data: { comments: opts.comments ?? [] } });
    if (url.endsWith('/activity')) return Promise.resolve({ data: { events: opts.events ?? [] } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  if (opts.postReply) mockedPost.mockImplementation(async () => opts.postReply!() as never);
  if (opts.patchReply) mockedPatch.mockImplementation(async () => opts.patchReply!() as never);
  if (opts.deleteReply) mockedDelete.mockImplementation(async () => opts.deleteReply!() as never);
}

function renderRail(estimate: EstimateDetail, readOnly = false) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <RightRail estimate={estimate} readOnly={readOnly} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('RightRail — Assumptions tab', () => {
  it('aggregates only line items with an aiAssumption and shows the section + confidence', async () => {
    setupApi();
    renderRail(buildEstimate());
    await waitFor(() => screen.getByTestId('rail-tab-assumptions'));
    const rows = await screen.findAllByTestId('assumption-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toMatch(/non-structural/i);
    expect(rows[0]?.textContent).toMatch(/Demolition/);
    expect(rows[0]?.textContent).toMatch(/55% confidence/);
  });

  it('shows an empty state when no line has an assumption', async () => {
    setupApi();
    const e = buildEstimate({
      lineItems: [
        {
          id: 'li-x',
          estimateId: 'e1',
          scopeSectionId: 'sec-1',
          description: 'Clean lines',
          quantity: '1',
          unitOfMeasure: 'LS',
          unitCostMaterial: '0',
          unitCostLabor: '0',
          markupPercent: '0',
          lineCost: '0',
          lineSellPrice: '0',
          status: 'DRAFT',
          source: 'MANUAL',
          aiConfidence: null,
          aiAssumption: null,
          order: 0,
        },
      ],
    });
    renderRail(e);
    expect(await screen.findByText(/no assumptions yet/i)).toBeInTheDocument();
  });
});

describe('RightRail — Comments tab', () => {
  it('lists comments and lets the user post a new one', async () => {
    setupApi({
      comments: [
        {
          id: 'c-1',
          estimateId: 'e1',
          lineItemId: null,
          body: 'Looks tight on demo',
          isResolved: false,
          resolvedById: null,
          resolvedAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          author: { id: 'u-other', firstName: 'Sam', lastName: 'P', email: 'sam@x.co' },
        },
      ],
      postReply: async () => ({
        data: {
          comment: {
            id: 'c-2',
            estimateId: 'e1',
            lineItemId: null,
            body: 'Acknowledged.',
            isResolved: false,
            resolvedById: null,
            resolvedAt: null,
            createdAt: '2026-04-28T00:00:01.000Z',
            author: { id: 'u1', firstName: 'Adam', lastName: 'Mark', email: 'a@b.c' },
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderRail(buildEstimate());

    await user.click(await screen.findByTestId('rail-tab-comments'));
    await waitFor(() => screen.getByText(/looks tight on demo/i));

    const input = screen.getByTestId('comment-input');
    await user.type(input, 'Acknowledged.');
    await user.click(screen.getByTestId('comment-submit'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/comments', {
        body: 'Acknowledged.',
      });
    });
    expect((screen.getByTestId('comment-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('reviewer can resolve another author\'s comment', async () => {
    setupApi({
      comments: [
        {
          id: 'c-1',
          estimateId: 'e1',
          lineItemId: null,
          body: 'open',
          isResolved: false,
          resolvedById: null,
          resolvedAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          author: { id: 'u-other', firstName: 'Sam', lastName: 'P', email: 'sam@x.co' },
        },
      ],
      patchReply: async () => ({
        data: {
          comment: {
            id: 'c-1',
            estimateId: 'e1',
            lineItemId: null,
            body: 'open',
            isResolved: true,
            resolvedById: 'u1',
            resolvedAt: '2026-04-28T00:01:00.000Z',
            createdAt: '2026-04-28T00:00:00.000Z',
            author: { id: 'u-other', firstName: 'Sam', lastName: 'P', email: 'sam@x.co' },
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderRail(buildEstimate());
    await user.click(await screen.findByTestId('rail-tab-comments'));
    await user.click(await screen.findByTestId('comment-resolve'));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/estimates/e1/comments/c-1', {
        isResolved: true,
      });
    });
  });

  it('hides the input + actions when readOnly', async () => {
    setupApi({
      comments: [
        {
          id: 'c-1',
          estimateId: 'e1',
          lineItemId: null,
          body: 'something',
          isResolved: false,
          resolvedById: null,
          resolvedAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          author: { id: 'u1', firstName: 'Adam', lastName: 'Mark', email: 'a@b.c' },
        },
      ],
    });
    const user = userEvent.setup();
    renderRail(buildEstimate({ status: 'APPROVED' }), true);
    await user.click(await screen.findByTestId('rail-tab-comments'));
    expect(screen.queryByTestId('comment-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comment-resolve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comment-delete')).not.toBeInTheDocument();
  });
});

describe('RightRail — Activity tab', () => {
  it('renders newest-first events with actor + summary', async () => {
    setupApi({
      events: [
        {
          id: 'a-2',
          eventType: 'ESTIMATE_APPROVED',
          entityType: 'Estimate',
          entityId: 'e1',
          estimateId: 'e1',
          summary: 'Approved estimate MAC-26-001',
          meta: null,
          createdAt: '2026-04-28T00:01:00.000Z',
          actor: { id: 'u1', firstName: 'Adam', lastName: 'Mark', email: 'a@b.c' },
        },
        {
          id: 'a-1',
          eventType: 'ESTIMATE_SUBMITTED_FOR_REVIEW',
          entityType: 'Estimate',
          entityId: 'e1',
          estimateId: 'e1',
          summary: 'Submitted for review',
          meta: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          actor: { id: 'u-d', firstName: 'D', lastName: 'R', email: 'd@x.co' },
        },
      ],
    });
    const user = userEvent.setup();
    renderRail(buildEstimate());
    await user.click(await screen.findByTestId('rail-tab-activity'));
    const rows = await screen.findAllByTestId('activity-row');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toMatch(/Approved/);
    expect(rows[1]?.textContent).toMatch(/Submitted for review/i);
  });

  it('renders an empty state when no events exist', async () => {
    setupApi({ events: [] });
    const user = userEvent.setup();
    renderRail(buildEstimate());
    await user.click(await screen.findByTestId('rail-tab-activity'));
    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
  });
});
