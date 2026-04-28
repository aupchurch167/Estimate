import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { InviteModal } from '@/features/team/InviteModal';
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

describe('InviteModal', () => {
  it('does not render when open=false', () => {
    renderWithProviders(<InviteModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders email + role + send/cancel when open', () => {
    renderWithProviders(<InviteModal open onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send invitation/i })).toBeInTheDocument();
  });

  it('rejects an invalid email client-side and does not call the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InviteModal open onClose={() => {}} />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('does not offer OWNER as a role choice (defense against accidental invite)', () => {
    renderWithProviders(<InviteModal open onClose={() => {}} />);
    const select = screen.getByLabelText(/role/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).not.toContain('OWNER');
    expect(optionValues).toEqual(expect.arrayContaining(['ADMIN', 'ESTIMATOR', 'PM', 'VIEWER']));
  });

  it('submits email + role on valid input and fires onCreated', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    mockedPost.mockResolvedValueOnce({
      data: {
        invitation: { id: 'i1', email: 'x@y.z', status: 'PENDING' },
        acceptUrl: 'http://localhost:5173/invite/abc',
        emailDispatched: false,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<InviteModal open onClose={onClose} onCreated={onCreated} />);
    await user.type(screen.getByLabelText(/email/i), 'newhire@example.com');
    await user.selectOptions(screen.getByLabelText(/role/i), 'PM');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/invitations', {
        email: 'newhire@example.com',
        role: 'PM',
      });
    });
    expect(onCreated).toHaveBeenCalledWith('http://localhost:5173/invite/abc', false);
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces invitation_pending → 409 with a clear banner', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'invitation_pending' } } },
    });
    renderWithProviders(<InviteModal open onClose={() => {}} />);
    await user.type(screen.getByLabelText(/email/i), 'newhire@example.com');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/pending invitation/i);
    });
  });
});
