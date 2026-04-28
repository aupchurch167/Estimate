import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/useAuth';
import { SignupForm } from '@/features/auth/SignupForm';

export function SignupPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && data?.user) {
      navigate('/app', { replace: true });
    }
  }, [data, isLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-[440px] border border-ink bg-paper-elevated p-8">
        <header className="mb-6 border-b border-rule pb-4 text-center">
          <h1 className="font-mono text-[14px] uppercase tracking-title text-ink">Quill</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim">
            Create account
          </p>
        </header>
        <SignupForm />
      </div>
    </div>
  );
}
