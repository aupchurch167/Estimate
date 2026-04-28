import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddSourceModal } from '@/features/estimates/sources/AddSourceModal';
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

function renderModal(open = true) {
  const onClose = vi.fn();
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <AddSourceModal open={open} onClose={onClose} estimateId="e1" />
    </QueryClientProvider>,
  );
  return { onClose, ...utils };
}

describe('AddSourceModal', () => {
  it('renders three tabs (Transcript / Email / Scope notes) with Transcript selected by default', () => {
    renderModal();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveTextContent(/transcript/i);
    expect(tabs[1]).toHaveTextContent(/email/i);
    expect(tabs[2]).toHaveTextContent(/scope notes/i);
  });

  it('switches the selected tab on click and updates the placeholder', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('tab', { name: /email/i }));
    expect(screen.getByRole('tab', { name: /email/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(/paste the email body/i)).toBeInTheDocument();
  });

  it('disables submit until both title and content are non-empty', async () => {
    const user = userEvent.setup();
    renderModal();
    const submit = screen.getByRole('button', { name: /add source/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/site walkthrough/i), 'Site walk');
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText(/paste a meeting transcript/i),
      'Customer wants demo + new partition',
    );
    expect(submit).toBeEnabled();
  });

  it('submits POST /api/estimates/:id/source-inputs with the active tab type', async () => {
    mockedPost.mockResolvedValueOnce({ data: { sourceInput: { id: 'src-1' } } });
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('tab', { name: /email/i }));
    await user.type(screen.getByPlaceholderText(/site walkthrough/i), 'GC reply');
    await user.type(
      screen.getByPlaceholderText(/paste the email body/i),
      'Hey, see scope below…',
    );
    await user.click(screen.getByRole('button', { name: /add source/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/estimates/e1/source-inputs', {
        type: 'EMAIL',
        title: 'GC reply',
        content: 'Hey, see scope below…',
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the backend error banner when create fails', async () => {
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: { code: 'cannot_edit_in_current_status', message: 'Estimate is SENT' },
        },
      },
    });
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByPlaceholderText(/site walkthrough/i), 'Late note');
    await user.type(
      screen.getByPlaceholderText(/paste a meeting transcript/i),
      'last-minute add',
    );
    await user.click(screen.getByRole('button', { name: /add source/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/SENT/i);
    });
  });
});
