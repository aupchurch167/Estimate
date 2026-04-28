/**
 * AuthContext exposes the resolved /me state to the entire authed tree.
 *
 * Internally it relies on `useCurrentUser` (TanStack Query against
 * /api/auth/me); the Provider just hoists that single query so descendants
 * read shared state instead of each making their own query call.
 *
 * The hook lives in a sibling file (./useAuthContext) so this module only
 * exports a component + a context object — fast refresh stays happy.
 *
 * For mutations (login / signup / logout) keep using the hooks from
 * features/auth/useAuth — those remain the canonical way to mutate auth
 * state. After a successful mutation, the /me query is invalidated and
 * AuthContext consumers re-render automatically.
 */

/* eslint-disable react-refresh/only-export-components -- the context object
   needs to live next to its Provider so the hook in ./useAuthContext can
   consume it without a circular dependency. */

import { createContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useCurrentUser } from '@/features/auth/useAuth';
import type { Organization, OrgSettings, SafeUser } from '@/features/auth/types';

export interface AuthContextValue {
  user: SafeUser | null;
  organization: Organization | null;
  settings: OrgSettings | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetch: () => Promise<unknown>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const query = useCurrentUser();
  const { data, isLoading, refetch } = query;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.user ?? null,
      organization: data?.organization ?? null,
      settings: data?.settings ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.user),
      refetch: () => refetch(),
    }),
    [data, isLoading, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
