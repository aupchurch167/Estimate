import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SchedulePanel } from '@/features/estimates/workspace/SchedulePanel';
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

beforeEach(() => {
  vi.mocked(api.patch).mockReset();
});

function buildEstimate(): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'Sample',
    description: null,
    status: 'DRAFT',
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
    totalCost: '300',
    totalMarkup: '60',
    totalSellPrice: '360',
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
        quantity: '100',
        unitOfMeasure: 'SF',
        unitCostMaterial: '1',
        unitCostLabor: '2',
        markupPercent: '0.20',
        lineCost: '300',
        lineSellPrice: '360',
        status: 'DRAFT',
        source: 'AI_GENERATED',
        aiConfidence: '0.9',
        aiAssumption: null,
        order: 0,
      },
    ],
    sourceInputs: [],
    conversation: null,
  };
}

function renderPanel(estimate: EstimateDetail) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SchedulePanel estimate={estimate} />
    </QueryClientProvider>,
  );
}

describe('SchedulePanel (draft mode)', () => {
  it('section is expanded by default and lists its line items', () => {
    renderPanel(buildEstimate());
    // Section header rendered.
    expect(screen.getByTestId('schedule-section-sec-1')).toBeInTheDocument();
    // Line item button visible because section opens by default.
    expect(screen.getByTestId('schedule-line-li-1')).toBeInTheDocument();
    expect(screen.getByText('Demo back wall')).toBeInTheDocument();
  });

  it('clicking a section toggles its line items', async () => {
    const user = userEvent.setup();
    renderPanel(buildEstimate());
    const header = screen.getByTestId('schedule-section-sec-1');
    expect(screen.getByTestId('schedule-line-li-1')).toBeInTheDocument();
    await user.click(header);
    expect(screen.queryByTestId('schedule-line-li-1')).not.toBeInTheDocument();
    await user.click(header);
    expect(screen.getByTestId('schedule-line-li-1')).toBeInTheDocument();
  });

  it('clicking a line opens the LineItemEditor modal', async () => {
    const user = userEvent.setup();
    renderPanel(buildEstimate());
    await user.click(screen.getByTestId('schedule-line-li-1'));
    expect(screen.getByTestId('line-item-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor-description')).toBeInTheDocument();
  });
});
