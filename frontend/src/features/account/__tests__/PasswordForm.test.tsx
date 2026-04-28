import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { PasswordForm } from '@/features/account/PasswordForm';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);
const mockedPatch = vi.mocked(api.patch);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPatch.mockReset();
  // PasswordForm depends on useAuthContext → useCurrentUser → /me. Resolve it.
  mockedGet.mockResolvedValue({
    data: {
      user: {
        id: 'u1',
        organizationId: 'o1',
        email: 'a@b.c',
        firstName: 'Adam',
        lastName: 'Mark',
        role: 'OWNER',
        isActive: true,
      },
      organization: { id: 'o1', name: 'Org' },
      settings: { id: 's1' },
    },
  });
});

describe('PasswordForm', () => {
  it('renders three password fields and an update button', async () => {
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  it('rejects new passwords shorter than 8 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/current password/i));

    await user.type(screen.getByLabelText(/current password/i), 'OriginalPass1!');
    await user.type(screen.getByLabelText(/^new password$/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirm passwords', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/current password/i));

    await user.type(screen.getByLabelText(/current password/i), 'OriginalPass1!');
    await user.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'DifferentPass-9');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('rejects when new password equals current password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/current password/i));

    await user.type(screen.getByLabelText(/current password/i), 'SamePass-1');
    await user.type(screen.getByLabelText(/^new password$/i), 'SamePass-1');
    await user.type(screen.getByLabelText(/confirm new password/i), 'SamePass-1');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/must differ from current/i)).toBeInTheDocument();
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('submits the change and shows a success banner', async () => {
    const user = userEvent.setup();
    mockedPatch.mockResolvedValueOnce({ data: undefined });
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/current password/i));

    await user.type(screen.getByLabelText(/current password/i), 'OriginalPass1!');
    await user.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'BrandNewPass-9');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/users/u1/password', {
        currentPassword: 'OriginalPass1!',
        newPassword: 'BrandNewPass-9',
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/password updated/i)).toBeInTheDocument();
    });
  });

  it('surfaces a "current password incorrect" message on 401', async () => {
    const user = userEvent.setup();
    mockedPatch.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: { error: { code: 'invalid_current_password' } },
      },
    });
    renderWithProviders(<PasswordForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/current password/i));

    await user.type(screen.getByLabelText(/current password/i), 'WRONG');
    await user.type(screen.getByLabelText(/^new password$/i), 'BrandNewPass-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'BrandNewPass-9');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i);
    });
  });
});
