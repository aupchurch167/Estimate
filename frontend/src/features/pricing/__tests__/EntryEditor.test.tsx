import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { EntryEditor } from '@/features/pricing/EntryEditor';
import type { PriceBookCategory } from '@/features/pricing/types';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedPost = vi.mocked(api.post);

const categories: PriceBookCategory[] = [
  {
    id: 'c1',
    organizationId: 'o1',
    priceBookId: 'pb1',
    name: 'Drywall',
    description: null,
    csiDivision: null,
    defaultMarkupPercent: '0.20',
    order: 0,
    createdAt: '',
    updatedAt: '',
    entryCount: 0,
  },
];

beforeEach(() => {
  mockedPost.mockReset();
});

describe('EntryEditor', () => {
  it('does not render when open=false', () => {
    renderWithProviders(
      <EntryEditor
        priceBookId="pb1"
        open={false}
        onClose={() => {}}
        categories={categories}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders all required fields when open', () => {
    renderWithProviders(
      <EntryEditor priceBookId="pb1" open onClose={() => {}} categories={categories} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/uom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/material \$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/labor \$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default markup/i)).toBeInTheDocument();
  });

  it('rejects empty description and out-of-range markup client-side', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EntryEditor priceBookId="pb1" open onClose={() => {}} categories={categories} />,
    );
    await user.clear(screen.getByLabelText(/material \$/i));
    await user.type(screen.getByLabelText(/material \$/i), '1.5');
    await user.type(screen.getByLabelText(/default markup/i), '2'); // > 1
    await user.click(screen.getByRole('button', { name: /create entry/i }));

    await waitFor(() => {
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      expect(screen.getByText(/0–1/i)).toBeInTheDocument();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('submits a valid create payload', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({
      data: { entry: { id: 'e1', description: 'Demo gypsum' } },
    });
    const onClose = vi.fn();
    renderWithProviders(
      <EntryEditor priceBookId="pb1" open onClose={onClose} categories={categories} />,
    );

    await user.type(screen.getByLabelText(/code/i), 'D-100');
    await user.type(screen.getByLabelText(/description/i), 'Demo gypsum partition');
    await user.selectOptions(screen.getByLabelText(/uom/i), 'SF');
    await user.clear(screen.getByLabelText(/material \$/i));
    await user.type(screen.getByLabelText(/material \$/i), '0.5');
    await user.clear(screen.getByLabelText(/labor \$/i));
    await user.type(screen.getByLabelText(/labor \$/i), '2');
    await user.type(screen.getByLabelText(/default markup/i), '0.2');
    await user.click(screen.getByRole('button', { name: /create entry/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith(
        '/api/price-books/pb1/entries',
        expect.objectContaining({
          categoryId: 'c1',
          code: 'D-100',
          description: 'Demo gypsum partition',
          unitOfMeasure: 'SF',
          unitCostMaterial: '0.5',
          unitCostLabor: '2',
          defaultMarkupPercent: '0.2',
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces a code_conflict 409 with a friendly banner', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'code_conflict' } } },
    });
    renderWithProviders(
      <EntryEditor priceBookId="pb1" open onClose={() => {}} categories={categories} />,
    );

    await user.type(screen.getByLabelText(/code/i), 'D-100');
    await user.type(screen.getByLabelText(/description/i), 'dup');
    await user.click(screen.getByRole('button', { name: /create entry/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/code already exists/i);
    });
  });
});
