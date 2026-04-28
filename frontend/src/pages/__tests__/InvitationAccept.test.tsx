import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { InvitationAcceptPage } from '@/pages/InvitationAccept';
import { api } from '@/lib/api';

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

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
});

function renderAt(token: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<InvitationAcceptPage />} />
          <Route path="/app" element={<div data-testid="app-marker">app</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvitationAcceptPage', () => {
  it('shows the form pre-filled with the invitation email', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        email: 'newhire@example.com',
        role: 'ESTIMATOR',
        organizationName: 'Mark Allan Contracting',
        inviterName: 'Adam Mark',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
    });
    renderAt('abc123');
    const email = (await screen.findByLabelText(/email/i)) as HTMLInputElement;
    expect(email).toBeDisabled();
    expect(email.value).toBe('newhire@example.com');
    expect(screen.getAllByText(/Mark Allan Contracting/).length).toBeGreaterThan(0);
  });

  it('shows an error state for a 404 (unknown token)', async () => {
    mockedGet.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'not_found' } } },
    });
    renderAt('unknown');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not be found/i);
    });
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
  });

  it('shows an error state for a revoked invitation (410 invitation_revoked)', async () => {
    mockedGet.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 410,
        data: { error: { code: 'invitation_revoked', message: 'Revoked' } },
      },
    });
    renderAt('revoked');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/revoked/i);
    });
  });

  it('submits accept with the locked email + form values and redirects to /app', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        email: 'newhire@example.com',
        role: 'ESTIMATOR',
        organizationName: 'Mark Allan Contracting',
        inviterName: 'Adam Mark',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
    });
    mockedPost.mockResolvedValueOnce({
      data: {
        user: { id: 'u1', email: 'newhire@example.com', firstName: 'New', lastName: 'Hire' },
        organization: { id: 'o1', name: 'Mark Allan Contracting', slug: 'mark-allan-contracting' },
      },
    });

    const user = userEvent.setup();
    renderAt('abc123');
    await waitFor(() => screen.getByLabelText(/first name/i));

    await user.type(screen.getByLabelText(/first name/i), 'New');
    await user.type(screen.getByLabelText(/last name/i), 'Hire');
    await user.type(screen.getByLabelText(/set a password/i), 'AcceptPass-1');
    await user.click(screen.getByRole('button', { name: /join Mark Allan Contracting/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/invitations/abc123/accept', {
        email: 'newhire@example.com',
        password: 'AcceptPass-1',
        firstName: 'New',
        lastName: 'Hire',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('app-marker')).toBeInTheDocument();
    });
  });
});
