import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserTable } from '@/features/team/UserTable';
import { AuthProvider } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { SafeUser } from '@/features/auth/types';

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
const mockedPatch = vi.mocked(api.patch);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedPatch.mockReset();
});

function meAs(id = 'admin-1', role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' = 'OWNER') {
  return {
    user: {
      id,
      organizationId: 'o1',
      email: 'admin@x.test',
      firstName: 'Admin',
      lastName: 'A',
      role,
      isActive: true,
    },
    organization: { id: 'o1', name: 'Org' },
    settings: { id: 's1' },
  };
}

function buildUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: 'u1',
    organizationId: 'o1',
    email: 'mate@x.test',
    emailVerifiedAt: null,
    firstName: 'Mate',
    lastName: 'X',
    role: 'ESTIMATOR',
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderTable(users: SafeUser[], meRole: 'OWNER' | 'ADMIN' | 'ESTIMATOR' = 'OWNER') {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve({ data: meAs('admin-1', meRole) });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <UserTable users={users} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('UserTable — admin actions', () => {
  it('admin sees role select + Deactivate button on a teammate row', async () => {
    renderTable([buildUser({ id: 'u1' })]);
    expect(await screen.findByTestId('user-role-select-u1')).toBeInTheDocument();
    expect(screen.getByTestId('user-deactivate-u1')).toBeInTheDocument();
  });

  it('non-admin viewer sees a read-only roster with no actions', async () => {
    renderTable([buildUser({ id: 'u1' })], 'ESTIMATOR');
    await screen.findByText(/Mate X/);
    expect(screen.queryByTestId('user-role-select-u1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-deactivate-u1')).not.toBeInTheDocument();
  });

  it('admin cannot edit OWNER row or their own row', async () => {
    renderTable([
      buildUser({ id: 'admin-1', role: 'OWNER', firstName: 'Admin', lastName: 'A' }),
      buildUser({ id: 'owner-2', role: 'OWNER', firstName: 'Owner', lastName: 'B' }),
    ]);
    await screen.findByText(/Admin A/);
    expect(screen.queryByTestId('user-role-select-admin-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-role-select-owner-2')).not.toBeInTheDocument();
  });

  it('changing role opens a confirm modal that PATCHes /role on submit', async () => {
    mockedPatch.mockResolvedValue({
      data: { user: buildUser({ id: 'u1', role: 'PM' }) },
    } as never);
    const user = userEvent.setup();
    renderTable([buildUser({ id: 'u1', role: 'ESTIMATOR' })]);

    const select = await screen.findByTestId('user-role-select-u1');
    await user.selectOptions(select, 'PM');

    await screen.findByTestId('user-confirm-modal');
    expect(screen.getByText(/from ESTIMATOR to PM/)).toBeInTheDocument();
    await user.click(screen.getByTestId('user-confirm-submit'));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/users/u1/role', { role: 'PM' });
    });
  });

  it('clicking Deactivate opens a confirm modal and POSTs /deactivate on submit', async () => {
    mockedPost.mockResolvedValue({
      data: { user: buildUser({ id: 'u1', isActive: false }) },
    } as never);
    const user = userEvent.setup();
    renderTable([buildUser({ id: 'u1' })]);

    await user.click(await screen.findByTestId('user-deactivate-u1'));
    await screen.findByTestId('user-confirm-modal');
    await user.click(screen.getByTestId('user-confirm-submit'));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/users/u1/deactivate');
    });
  });

  it('Reactivate hits the endpoint immediately without a confirm', async () => {
    mockedPost.mockResolvedValue({
      data: { user: buildUser({ id: 'u1', isActive: true }) },
    } as never);
    const user = userEvent.setup();
    renderTable([buildUser({ id: 'u1', isActive: false })]);

    await user.click(await screen.findByTestId('user-reactivate-u1'));
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/users/u1/reactivate');
    });
    expect(screen.queryByTestId('user-confirm-modal')).not.toBeInTheDocument();
  });

  it('shows a friendly error banner when the backend rejects with cannot_target_self', async () => {
    mockedPatch.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: { code: 'cannot_target_self', message: 'no' } },
      },
    });
    const user = userEvent.setup();
    renderTable([buildUser({ id: 'u1' })]);

    await user.selectOptions(await screen.findByTestId('user-role-select-u1'), 'PM');
    await user.click(await screen.findByTestId('user-confirm-submit'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/yourself/i);
    });
  });
});
