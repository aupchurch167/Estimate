import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage, useLogin } from './useAuth';
import { Field, inputClass } from './Field';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

function mapLoginError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 429 || code === 'rate_limited') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (status === 401 || code === 'invalid_credentials') {
    return 'Invalid email or password.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return backendErrorMessage(err, 'Something went wrong. Please try again.');
}

export function LoginForm() {
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate('/app', { replace: true });
    } catch {
      // surfaced via login.error below
    }
  });

  const banner = login.error ? mapLoginError(login.error) : null;
  const busy = isSubmitting || login.isPending;

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

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? 'true' : 'false'}
          className={inputClass}
          {...register('email')}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
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
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="border-t border-rule-soft pt-4 text-center font-mono text-[10px] uppercase tracking-label text-dim">
        New here?{' '}
        <Link to="/signup" className="text-ink underline-offset-2 hover:underline">
          Create an account →
        </Link>
      </div>
    </form>
  );
}
