import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCurrentUser } from '@/features/auth/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { data, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
      </div>
    );
  }

  if (!data?.user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
