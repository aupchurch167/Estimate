import { Link } from 'react-router-dom';
import { LoginForm } from '@/features/auth/LoginForm';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { Card } from '@/components/ui';

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-secondary p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-text-primary">Quill</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            Sign in to your estimating workspace.
          </p>
        </div>
        <Card spacious>
          <div className="flex flex-col gap-5">
            <LoginForm />
            <GoogleSignInButton />
          </div>
        </Card>
        <p className="mt-4 text-center text-[13px] text-text-secondary">
          New to Quill?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
