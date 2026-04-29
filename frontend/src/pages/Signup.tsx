import { Link } from 'react-router-dom';
import { SignupForm } from '@/features/auth/SignupForm';
import { Card } from '@/components/ui';

export function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-secondary p-6">
      <div className="w-full max-w-[480px]">
        <div className="mb-6 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-text-primary">Quill</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            Create your organization to start drafting estimates.
          </p>
        </div>
        <Card spacious>
          <SignupForm />
        </Card>
        <p className="mt-4 text-center text-[13px] text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
