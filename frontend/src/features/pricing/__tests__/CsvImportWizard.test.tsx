import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { CsvImportWizard } from '@/features/pricing/CsvImportWizard';
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

beforeEach(() => {
  mockedPost.mockReset();
});

function makeFile() {
  return new File(['category,description\nDrywall,5/8 gypsum\n'], 'pricing.csv', {
    type: 'text/csv',
  });
}

describe('CsvImportWizard', () => {
  it('does not render when open=false', () => {
    renderWithProviders(<CsvImportWizard open={false} onClose={() => {}} priceBookId="pb1" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('walks idle → preview → done with two API calls (dryRun then commit)', async () => {
    const user = userEvent.setup();
    mockedPost
      .mockResolvedValueOnce({
        data: {
          totalRows: 1,
          validRows: 1,
          errorRows: 0,
          categoriesToCreate: [],
          entriesToCreate: 1,
          entriesToUpdate: 0,
          entriesSkipped: 0,
          errors: [],
          committed: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          totalRows: 1,
          validRows: 1,
          errorRows: 0,
          categoriesToCreate: [],
          entriesToCreate: 1,
          entriesToUpdate: 0,
          entriesSkipped: 0,
          errors: [],
          committed: true,
        },
      });

    renderWithProviders(<CsvImportWizard open onClose={() => {}} priceBookId="pb1" />);
    expect(screen.getByText(/Upload a CSV/i)).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());

    await user.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /commit 1 rows/i })).toBeInTheDocument();
    });
    expect(mockedPost).toHaveBeenCalledWith(
      '/api/price-books/pb1/import?dryRun=true',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );

    await user.click(screen.getByRole('button', { name: /commit 1 rows/i }));

    await waitFor(() => {
      expect(screen.getByText(/Import committed/i)).toBeInTheDocument();
    });
    expect(mockedPost).toHaveBeenLastCalledWith(
      '/api/price-books/pb1/import',
      expect.any(FormData),
      expect.any(Object),
    );
  });

  it('disables Commit when the preview has per-row errors', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({
      data: {
        totalRows: 2,
        validRows: 1,
        errorRows: 1,
        categoriesToCreate: [],
        entriesToCreate: 1,
        entriesToUpdate: 0,
        entriesSkipped: 0,
        errors: [{ row: 2, column: 'description', message: 'description is required' }],
        committed: false,
      },
    });
    renderWithProviders(<CsvImportWizard open onClose={() => {}} priceBookId="pb1" />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    await user.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByText(/per-row errors/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /commit 1 rows/i })).toBeDisabled();
    expect(screen.getByText(/description is required/i)).toBeInTheDocument();
  });
});
