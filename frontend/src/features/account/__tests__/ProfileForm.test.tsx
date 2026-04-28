import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { ProfileForm } from '@/features/account/ProfileForm';
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
        avatarUrl: null,
      },
      organization: { id: 'o1', name: 'Acme' },
      settings: { id: 's1' },
    },
  });
});

describe('ProfileForm', () => {
  it('pre-fills the form from /me and disables the save button while clean', async () => {
    renderWithProviders(<ProfileForm />, { withAuth: true });
    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toHaveValue('Adam');
    });
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Mark');
    const save = screen.getByRole('button', { name: /save profile/i });
    expect(save).toBeDisabled();
  });

  it('submits the patch when the form is dirty', async () => {
    const user = userEvent.setup();
    mockedPatch.mockResolvedValueOnce({
      data: { user: { id: 'u1', firstName: 'New', lastName: 'Mark' } },
    });
    renderWithProviders(<ProfileForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/first name/i));

    const firstName = screen.getByLabelText(/first name/i);
    await user.clear(firstName);
    await user.type(firstName, 'New');
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(mockedPatch).toHaveBeenCalledWith('/api/users/u1', {
        firstName: 'New',
        lastName: 'Mark',
      });
    });
  });

  it('rejects an empty firstName client-side', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/first name/i));

    const firstName = screen.getByLabelText(/first name/i);
    await user.clear(firstName);
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    });
    expect(mockedPatch).not.toHaveBeenCalled();
  });

  it('renders the email field as read-only', async () => {
    renderWithProviders(<ProfileForm />, { withAuth: true });
    await waitFor(() => screen.getByLabelText(/first name/i));
    const email = screen.getByLabelText(/email/i);
    expect(email).toBeDisabled();
    expect(email).toHaveValue('adam@example.com');
  });
});
