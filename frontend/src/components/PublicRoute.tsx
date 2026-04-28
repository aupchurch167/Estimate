/**
 * Public auth routes (/login, /signup) wrap their children in this so
 * already-authenticated users get bounced to /app instead of seeing a
 * flash of the login form. While the /me query is still resolving we
 * show a minimal loading splash so we don't render the form for a
 * moment and then redirect.
 */

import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthContext } from '@/context/useAuthContext';

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
