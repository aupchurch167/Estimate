import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage, useSignup } from './useAuth';
import { Field, inputClass } from './Field';

const schema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(120),
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
type FormValues = z.infer<typeof schema>;

function mapSignupError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 429 || code === 'rate_limited') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (status === 409 || code === 'email_taken') {
    return 'An account with this email already exists. Try signing in.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return backendErrorMessage(err, 'Something went wrong. Please try again.');
}

export function SignupForm() {
  const navigate = useNavigate();
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup.mutateAsync(values);
      navigate('/app', { replace: true });
    } catch {
      // surfaced below
    }
  });

  const banner = signup.error ? mapSignupError(signup.error) : null;
  const busy = isSubmitting || signup.isPending;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      {banner ? (
        <div
          role="alert"
          className="border border-mark-red/60 bg-paper-elevated px-4 py-3 font-mono text-[11px] uppercase tracking-label text-mark-red"
        >
          {banner}
        </div>
      ) : null}

      <Field label="Company Name" htmlFor="companyName" error={errors.companyName?.message}>
        <input
          id="companyName"
          type="text"
          autoComplete="organization"
          autoFocus
          aria-invalid={errors.companyName ? 'true' : 'false'}
          className={inputClass}
          {...register('companyName')}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" htmlFor="firstName" error={errors.firstName?.message}>
          <input
            id="firstName"
            type="text"
            autoComplete="given-name"
            aria-invalid={errors.firstName ? 'true' : 'false'}
            className={inputClass}
            {...register('firstName')}
          />
        </Field>
        <Field label="Last Name" htmlFor="lastName" error={errors.lastName?.message}>
          <input
            id="lastName"
            type="text"
            autoComplete="family-name"
            aria-invalid={errors.lastName ? 'true' : 'false'}
            className={inputClass}
            {...register('lastName')}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? 'true' : 'false'}
          className={inputClass}
          {...register('email')}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? 'true' : 'false'}
          className={inputClass}
          {...register('password')}
        />
      </Field>

      <button
        type="submit"
        disabled={busy}
        className="mt-2 border border-ink bg-ink py-3 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Creating account…' : 'Create account'}
      </button>

      <div className="border-t border-rule-soft pt-4 text-center font-mono text-[10px] uppercase tracking-label text-dim">
        Already have an account?{' '}
        <Link to="/login" className="text-ink underline-offset-2 hover:underline">
          Sign in →
        </Link>
      </div>
    </form>
  );
}
