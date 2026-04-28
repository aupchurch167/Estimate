import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PublicRoute } from '@/components/PublicRoute';
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

const appMarker = <div data-testid="app-marker">app shell</div>;
const loginMarker = <div data-testid="login-marker">login form</div>;

describe('PublicRoute', () => {
  it('redirects to /app when the user is already authenticated', async () => {
    mockedGet.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'adam@example.com',
          firstName: 'Adam',
          lastName: 'Mark',
          role: 'OWNER',
          isActive: true,
        },
        organization: { id: 'o1', name: 'Acme' },
        settings: { id: 's1' },
      },
    });

    renderWithProviders(<PublicRoute>{loginMarker}</PublicRoute>, {
      withAuth: true,
      routes: [{ path: '/app', element: appMarker }],
    });

    await waitFor(() => {
      expect(screen.getByTestId('app-marker')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('login-marker')).not.toBeInTheDocument();
  });

  it('renders children when /me returns 401 (unauthenticated)', async () => {
    mockedGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });

    renderWithProviders(<PublicRoute>{loginMarker}</PublicRoute>, { withAuth: true });

    await waitFor(() => {
      expect(screen.getByTestId('login-marker')).toBeInTheDocument();
    });
  });
});
