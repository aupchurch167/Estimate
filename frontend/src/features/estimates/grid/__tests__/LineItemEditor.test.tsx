import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineItemEditor } from '@/features/estimates/grid/LineItemEditor';
import { api } from '@/lib/api';
import type { EstimateDetail, EstimateStatus, LineItem } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedPatch = vi.mocked(api.patch);

beforeEach(() => {
  mockedPatch.mockReset();
});

function buildEstimate(status: EstimateStatus = 'IN_REVIEW'): EstimateDetail {
  return {
    id: 'e1',
    organizationId: 'o1',
    number: 'MAC-26-001',
    title: 'Test',
    description: null,
    status,
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
    scopeSections: [
      {
        id: 'sec-1',
        estimateId: 'e1',
        name: 'Demo',
        description: null,
        order: 0,
        markupPercent: null,
      },
    ],
    lineItems: [],
    sourceInputs: [],
    conversation: null,
  };
}

function buildItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'li-1',
    estimateId: 'e1',
    scopeSectionId: 'sec-1',
    description: 'Demo gypsum',
    quantity: '10',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.50',
    unitCostLabor: '2.00',
    markupPercent: '0.20',
    lineCost: '25',
    lineSellPrice: '30',
    status: 'CONFIRMED',
    source: 'MANUAL',
    aiConfidence: null,
    aiAssumption: null,
    order: 0,
    ...overrides,
  };
}

function renderEditor(item: LineItem, status: EstimateStatus = 'IN_REVIEW') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={qc}>
      <LineItemEditor estimate={buildEstimate(status)} item={item} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...view, onClose };
}

describe('LineItemEditor', () => {
  it('opens populated with the line item values', () => {
    renderEditor(buildItem());
    expect(screen.getByTestId('line-item-editor')).toBeInTheDocument();
    expect((screen.getByTestId('editor-description') as HTMLTextAreaElement).value).toBe(
      'Demo gypsum',
    );
    expect((screen.getByTestId('editor-quantity') as HTMLInputElement).value).toBe('10');
    expect((screen.getByTestId('editor-unitCostMaterial') as HTMLInputElement).value).toBe(
      '0.50',
    );
    expect((screen.getByTestId('editor-status') as HTMLSelectElement).value).toBe('CONFIRMED');
  });

  it('Save commits every changed field in a single PATCH and closes the modal', async () => {
    mockedPatch.mockResolvedValueOnce({
      data: { lineItem: { id: 'li-1', description: 'Updated demo' } },
    });
    const user = userEvent.setup();
    const { onClose } = renderEditor(buildItem());

    const desc = screen.getByTestId('editor-description');
    await user.clear(desc);
    await user.type(desc, 'Updated demo');
    const qty = screen.getByTestId('editor-quantity');
    await user.clear(qty);
    await user.type(qty, '20');
    const internal = screen.getByTestId('editor-internalNotes');
    await user.type(internal, 'Note');

    await user.click(screen.getByTestId('editor-save'));
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith(
        '/api/line-items/li-1',
        expect.objectContaining({
          description: 'Updated demo',
          quantity: '20',
          internalNotes: 'Note',
        }),
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('Cancel discards changes and does NOT post', async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor(buildItem());
    const desc = screen.getByTestId('editor-description');
    await user.clear(desc);
    await user.type(desc, 'Different');
    await user.click(screen.getByTestId('editor-cancel'));
    expect(mockedPatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sub-quote fields appear only when status is PENDING_SUB_QUOTE', async () => {
    const user = userEvent.setup();
    renderEditor(buildItem());
    expect(screen.queryByTestId('editor-subQuoteFrom')).not.toBeInTheDocument();
    const status = screen.getByTestId('editor-status');
    await user.selectOptions(status, 'PENDING_SUB_QUOTE');
    expect(screen.getByTestId('editor-subQuoteFrom')).toBeInTheDocument();
  });

  it('opens read-only with a banner when the estimate is SENT', () => {
    renderEditor(buildItem(), 'SENT');
    expect(screen.getByTestId('line-item-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-save')).not.toBeInTheDocument();
    // Description textarea exists but is disabled.
    const desc = screen.getByTestId('editor-description') as HTMLTextAreaElement;
    expect(desc.disabled).toBe(true);
    // Banner explaining lock.
    expect(screen.getByText(/SENT/)).toBeInTheDocument();
  });

  it('Cmd-Enter saves; Escape closes', async () => {
    mockedPatch.mockResolvedValue({
      data: { lineItem: { id: 'li-1', quantity: '12' } },
    });
    const user = userEvent.setup();
    const { onClose } = renderEditor(buildItem());
    const qty = screen.getByTestId('editor-quantity');
    await user.clear(qty);
    await user.type(qty, '12');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith(
        '/api/line-items/li-1',
        expect.objectContaining({ quantity: '12' }),
      );
    });

    // Reset and verify Escape closes.
    onClose.mockClear();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('save with no changes still closes the modal without posting', async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor(buildItem());
    await user.click(screen.getByTestId('editor-save'));
    expect(mockedPatch).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
