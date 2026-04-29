import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { SignupForm } from '@/features/auth/SignupForm';
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

describe('SignupForm', () => {
  it('renders all required fields and a create-account button', () => {
    renderWithProviders(<SignupForm />);
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows inline errors when submitting empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm />);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText(/company name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters with a field-level error', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm />);
    await user.type(screen.getByLabelText(/company name/i), 'Acme Co');
    await user.type(screen.getByLabelText(/first name/i), 'Adam');
    await user.type(screen.getByLabelText(/last name/i), 'Mark');
    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('calls the signup mutation with the form values', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce({
      data: { user: { email: 'a@b.c' }, organization: {}, settings: {} },
    });
    renderWithProviders(<SignupForm />);

    await user.type(screen.getByLabelText(/company name/i), 'Acme Co');
    await user.type(screen.getByLabelText(/first name/i), 'Adam');
    await user.type(screen.getByLabelText(/last name/i), 'Mark');
    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/api/auth/signup', {
        companyName: 'Acme Co',
        firstName: 'Adam',
        lastName: 'Mark',
        email: 'adam@example.com',
        password: 'password123',
      });
    });
  });

  it('shows a 409 email-taken message clearly', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'email_taken' } } },
    });
    renderWithProviders(<SignupForm />);

    await user.type(screen.getByLabelText(/company name/i), 'Acme Co');
    await user.type(screen.getByLabelText(/first name/i), 'Adam');
    await user.type(screen.getByLabelText(/last name/i), 'Mark');
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
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
    renderWithProviders(<SignupForm />);

    await user.type(screen.getByLabelText(/company name/i), 'Acme Co');
    await user.type(screen.getByLabelText(/first name/i), 'Adam');
    await user.type(screen.getByLabelText(/last name/i), 'Mark');
    await user.type(screen.getByLabelText(/email/i), 'adam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const submit = screen.getByRole('button', { name: /create account/i });
      expect(submit).toBeDisabled();
      expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    });

    resolve({ data: { user: { email: 'adam@example.com' }, organization: {}, settings: {} } });
  });
});
