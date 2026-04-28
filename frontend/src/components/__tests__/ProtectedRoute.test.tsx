import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

beforeEach(() => {
  mockedGet.mockReset();
});

function loginMarker() {
  return <div data-testid="login-marker">login page</div>;
}

function appMarker() {
  return <div data-testid="app-marker">protected content</div>;
}

describe('ProtectedRoute', () => {
  it('redirects to /login when /me returns 401', async () => {
    mockedGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });

    renderWithProviders(<ProtectedRoute>{appMarker()}</ProtectedRoute>, {
      withAuth: true,
      routes: [{ path: '/login', element: loginMarker() }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-marker')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-marker')).not.toBeInTheDocument();
  });

  it('renders children when /me resolves with a user', async () => {
    mockedGet.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          organizationId: 'o1',
          email: 'adam@example.com',
          firstName: 'Adam',
          lastName: 'Mark',
          role: 'OWNER',
          isActive: true,
        },
        organization: { id: 'o1', name: 'Acme' },
        settings: { id: 's1', estimateNumberPrefix: 'ACM' },
      },
    });

    renderWithProviders(<ProtectedRoute>{appMarker()}</ProtectedRoute>, { withAuth: true });

    await waitFor(() => {
      expect(screen.getByTestId('app-marker')).toBeInTheDocument();
    });
  });

  it('shows the loading state while /me is in flight', async () => {
    let resolveGet!: (v: unknown) => void;
    mockedGet.mockReturnValueOnce(new Promise((r) => (resolveGet = r)));

    renderWithProviders(<ProtectedRoute>{appMarker()}</ProtectedRoute>, { withAuth: true });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    resolveGet({
      data: {
        user: { id: 'u1', firstName: 'A', lastName: 'B' },
        organization: { id: 'o1' },
        settings: { id: 's1' },
      },
    });
  });
});
