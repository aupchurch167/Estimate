import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { LoginForm } from '@/features/auth/LoginForm';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  mockedPost.mockReset();
});

describe('LoginForm', () => {
  it('renders email and password fields and a sign-in button', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows inline validation errors on empty submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('calls the login mutation with the submitted credentials', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({ data: { user: { email: 'a@b.c' } } });
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/auth/login', {
        email: 'adam@example.com',
        password: 'password123',
      });
    });
  });

  it('surfaces a generic 401 message for invalid credentials', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 401,
        data: { error: { code: 'invalid_credentials', message: 'Invalid email or password' } },
      },
    });
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i);
    });
  });

  it('surfaces a rate-limit message on 429', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, data: { error: { code: 'rate_limited' } } },
    });
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many attempts/i);
    });
  });

  it('disables the submit button while the mutation is pending', async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    mockedPost.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });

    resolve({ data: { user: { email: 'adam@example.com' } } });
  });
});
