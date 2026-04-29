import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditSourceModal } from '@/features/estimates/sources/EditSourceModal';
import { api } from '@/lib/api';
import type { SourceInput } from '@/features/estimates/types';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedPatch = vi.mocked(api.patch);
const mockedDelete = vi.mocked(api.delete);

beforeEach(() => {
  mockedPatch.mockReset();
  mockedDelete.mockReset();
});

function textSource(overrides: Partial<SourceInput> = {}): SourceInput {
  return {
    id: 's-1',
    estimateId: 'e1',
    type: 'TRANSCRIPT',
    title: 'Walkthrough',
    content: 'Demo back wall, frame partition.',
    fileUrl: null,
    createdAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function fileSource(): SourceInput {
  return {
    id: 's-file',
    estimateId: 'e1',
    type: 'PLAN_PDF',
    title: 'Plans.pdf',
    content: null,
    fileUrl: 'https://example.test/plans.pdf',
    createdAt: '2026-04-28T00:00:00.000Z',
  };
}

function renderModal(
  source: SourceInput,
  opts: { readOnly?: boolean } = {},
) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={qc}>
      <EditSourceModal
        estimateId="e1"
        source={source}
        readOnly={opts.readOnly}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { ...view, onClose };
}

describe('EditSourceModal', () => {
  it('opens populated for a text source; saving PATCHes and closes', async () => {
    mockedPatch.mockResolvedValueOnce({
      data: { sourceInput: { id: 's-1', title: 'Updated walkthrough' } },
    });
    const user = userEvent.setup();
    const { onClose } = renderModal(textSource());
    const title = screen.getByTestId('edit-source-title') as HTMLInputElement;
    expect(title.value).toBe('Walkthrough');
    const content = screen.getByTestId('edit-source-content') as HTMLTextAreaElement;
    expect(content.value).toBe('Demo back wall, frame partition.');

    await user.clear(title);
    await user.type(title, 'Updated walkthrough');
    await user.click(screen.getByTestId('edit-source-save'));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/source-inputs/s-1', {
        title: 'Updated walkthrough',
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('opens read-only for a file source — no save button, content textarea hidden', () => {
    renderModal(fileSource());
    expect(screen.queryByTestId('edit-source-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-source-content')).not.toBeInTheDocument();
    // Read-only banner explaining the rule.
    expect(screen.getByText(/Files cannot be edited/i)).toBeInTheDocument();
    // Title shown but disabled.
    const title = screen.getByTestId('edit-source-title') as HTMLInputElement;
    expect(title.disabled).toBe(true);
  });

  it('readOnly={true} (estimate locked) hides save + delete', () => {
    renderModal(textSource(), { readOnly: true });
    expect(screen.queryByTestId('edit-source-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-source-delete')).not.toBeInTheDocument();
    expect(screen.getByText(/can't be edited/i)).toBeInTheDocument();
  });

  it('cancel discards changes and closes without posting', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal(textSource());
    const title = screen.getByTestId('edit-source-title');
    await user.clear(title);
    await user.type(title, 'X');
    await user.click(screen.getByTestId('edit-source-cancel'));
    expect(mockedPatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('save is disabled until something changes', async () => {
    const user = userEvent.setup();
    renderModal(textSource());
    expect(screen.getByTestId('edit-source-save')).toBeDisabled();
    const title = screen.getByTestId('edit-source-title');
    await user.type(title, '!');
    expect(screen.getByTestId('edit-source-save')).toBeEnabled();
  });

  it('delete: confirm flow PATCHes nothing and DELETEs the source, then closes', async () => {
    mockedDelete.mockResolvedValueOnce({ data: undefined });
    const user = userEvent.setup();
    const { onClose } = renderModal(textSource());
    await user.click(screen.getByTestId('edit-source-delete'));
    await user.click(await screen.findByTestId('edit-source-delete-confirm'));
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith('/api/source-inputs/s-1');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('maps file_source_not_editable into a friendly inline error', async () => {
    mockedPatch.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'file_source_not_editable', message: 'no' } },
      },
    });
    const user = userEvent.setup();
    renderModal(textSource());
    const title = screen.getByTestId('edit-source-title');
    await user.type(title, '!');
    await user.click(screen.getByTestId('edit-source-save'));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(
        /Delete and re-upload to replace/i,
      );
    });
  });
});
