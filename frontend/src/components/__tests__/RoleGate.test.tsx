import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { RoleGate } from '@/components/RoleGate';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

beforeEach(() => {
  mockedGet.mockReset();
});

function meAs(role: string) {
  return {
    data: {
      user: {
        id: 'u1',
        organizationId: 'o1',
        email: 'x@y.z',
        firstName: 'X',
        lastName: 'Y',
        role,
        isActive: true,
      },
      organization: { id: 'o1', name: 'Org' },
      settings: { id: 's1' },
    },
  };
}

describe('RoleGate', () => {
  it('renders children when the user role is in the allowlist', async () => {
    mockedGet.mockResolvedValue(meAs('OWNER'));
    renderWithProviders(
      <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
        <div data-testid="kid">admin-only</div>
      </RoleGate>,
      { withAuth: true },
    );
    await waitFor(() => {
      expect(screen.getByTestId('kid')).toBeInTheDocument();
    });
  });

  it('hides children when the user role is not in the allowlist', async () => {
    mockedGet.mockResolvedValue(meAs('ESTIMATOR'));
    renderWithProviders(
      <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
        <div data-testid="kid">admin-only</div>
      </RoleGate>,
      { withAuth: true },
    );
    // The /me query resolves; we then assert the gate is closed.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('kid')).not.toBeInTheDocument();
  });

  it('renders the fallback when the gate is closed', async () => {
    mockedGet.mockResolvedValue(meAs('VIEWER'));
    renderWithProviders(
      <RoleGate allowedRoles={['OWNER']} fallback={<div data-testid="alt">contact owner</div>}>
        <div data-testid="kid">danger zone</div>
      </RoleGate>,
      { withAuth: true },
    );
    await waitFor(() => {
      expect(screen.getByTestId('alt')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('kid')).not.toBeInTheDocument();
  });

  it('hides children when there is no user (unauthenticated)', async () => {
    mockedGet.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    renderWithProviders(
      <RoleGate allowedRoles={['OWNER', 'ADMIN', 'ESTIMATOR', 'PM', 'VIEWER']}>
        <div data-testid="kid">anyone</div>
      </RoleGate>,
      { withAuth: true },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('kid')).not.toBeInTheDocument();
  });
});
