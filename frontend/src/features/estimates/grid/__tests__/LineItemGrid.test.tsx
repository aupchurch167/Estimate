import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineItemGrid } from '@/features/estimates/grid/LineItemGrid';
import { api } from '@/lib/api';
import type { EstimateDetail, EstimateStatus } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedPost = vi.mocked(api.post);
const mockedPatch = vi.mocked(api.patch);
const mockedDelete = vi.mocked(api.delete);

beforeEach(() => {
  mockedPost.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

function buildEstimate(status: EstimateStatus = 'IN_REVIEW'): EstimateDetail {
  const sectionId = 'sec-1';
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
      { id: sectionId, estimateId: 'e1', name: 'Demolition', description: null, order: 0, markupPercent: null },
    ],
    lineItems: [
      {
        id: 'li-1',
        estimateId: 'e1',
        scopeSectionId: sectionId,
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
      },
      {
        id: 'li-2',
        estimateId: 'e1',
        scopeSectionId: sectionId,
        description: 'HVAC sub-quote pending',
        quantity: '1',
        unitOfMeasure: 'LS',
        unitCostMaterial: '0',
        unitCostLabor: '0',
        markupPercent: '0.20',
        lineCost: '0',
        lineSellPrice: '0',
        status: 'NO_PRICE',
        source: 'AI_GENERATED',
        aiConfidence: '0.4',
        aiAssumption: 'Sub to be quoted',
        order: 1,
      },
    ],
    sourceInputs: [],
    conversation: null,
  };
}

function renderGrid(estimate: EstimateDetail) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <table className="hidden" />
      <LineItemGrid estimate={estimate} />
    </QueryClientProvider>,
  );
}

describe('LineItemGrid', () => {
  it('renders both rows under the section header', () => {
    renderGrid(buildEstimate());
    expect(screen.getByText('A · Demolition', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Demo gypsum')).toBeInTheDocument();
    expect(screen.getByText('HVAC sub-quote pending')).toBeInTheDocument();
  });

  it('"No price" filter pill hides rows that don’t match', async () => {
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    await user.click(screen.getByRole('button', { name: /no price/i }));
    expect(screen.queryByText('Demo gypsum')).not.toBeInTheDocument();
    expect(screen.getByText('HVAC sub-quote pending')).toBeInTheDocument();
  });

  it('search box filters by description', async () => {
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    await user.type(screen.getByPlaceholderText(/filter rows/i), 'gypsum');
    expect(screen.getByText('Demo gypsum')).toBeInTheDocument();
    expect(screen.queryByText('HVAC sub-quote pending')).not.toBeInTheDocument();
  });

  it('clicking the description cell opens the modal editor (long-text fields are NOT inline-editable)', async () => {
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    const desc = screen.getByText('Demo gypsum');
    await user.click(desc);
    // The LineItemEditor modal is mounted instead of an inline input.
    expect(screen.getByTestId('line-item-editor')).toBeInTheDocument();
    expect(screen.getByTestId('editor-description')).toBeInTheDocument();
    // No inline single-line input ever appeared.
    expect(
      screen.queryByDisplayValue('Demo gypsum') === screen.queryByTestId('editor-description'),
    ).toBe(true);
  });

  it('numeric cells still inline-edit: typing a new quantity + blur calls PATCH', async () => {
    mockedPatch.mockResolvedValueOnce({
      data: { lineItem: { id: 'li-1', quantity: '15' } },
    });
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    // The fixture's li-1 quantity is '10'.
    const qty = screen.getByText('10');
    await user.click(qty);
    const input = screen.getByDisplayValue('10');
    await user.clear(input);
    await user.type(input, '15');
    input.blur();
    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/line-items/li-1', {
        quantity: '15',
      });
    });
  });

  it('clearing a numeric cell to empty cancels (does NOT 400 the server)', async () => {
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    const qty = screen.getByText('10');
    await user.click(qty);
    const input = screen.getByDisplayValue('10');
    await user.clear(input);
    input.blur();
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('+ Section button posts a new section', async () => {
    mockedPost.mockResolvedValueOnce({ data: { section: { id: 'sec-2' } } });
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    await user.click(screen.getByRole('button', { name: /\+ section/i }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/estimates/e1/scope-sections',
        expect.objectContaining({ name: expect.any(String) }),
      );
    });
  });

  it('+ Line button posts a new line item under the section', async () => {
    mockedPost.mockResolvedValueOnce({ data: { lineItem: { id: 'li-3' } } });
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    await user.click(screen.getByRole('button', { name: /\+ line/i }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/scope-sections/sec-1/line-items',
        expect.objectContaining({ description: expect.any(String) }),
      );
    });
  });

  it('bulk delete: selecting two rows + Delete confirms and POSTs /bulk', async () => {
    mockedPost.mockResolvedValueOnce({ data: { count: 2 } });
    const user = userEvent.setup();
    renderGrid(buildEstimate());
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);
    await user.click(screen.getByRole('button', { name: /^Delete 2$/ }));
    // Confirm dialog has a button labelled "Delete 2" too — pick it via the dialog.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Delete 2$/ }));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/line-items/bulk', {
        operation: 'delete',
        lineItemIds: ['li-1', 'li-2'],
      });
    });
  });

  it('renders read-only when estimate status is SENT (no edit affordances)', () => {
    renderGrid(buildEstimate('SENT'));
    expect(screen.queryByRole('button', { name: /\+ section/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\+ line/i })).not.toBeInTheDocument();
    // Per-row checkboxes still render but bulk toolbar can't trigger writes.
    const row = screen.getByTestId('row-li-1');
    // No delete (×) button visible because readOnly.
    expect(within(row).queryByLabelText(/delete line/i)).not.toBeInTheDocument();
  });
});
