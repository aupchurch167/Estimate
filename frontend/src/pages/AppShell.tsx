import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { RoleGate } from '@/components/RoleGate';

export function AppShell() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b-[1.5px] border-ink bg-paper">
        <div className="mx-auto flex max-w-[1280px] items-stretch justify-between px-6">
          <div className="flex items-center gap-6 py-4">
            <span className="font-mono text-[16px] uppercase tracking-title text-ink">Quill</span>
            {organization ? (
              <span className="border-l border-rule-soft pl-6 font-mono text-[10px] uppercase tracking-label text-dim">
                {organization.name}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4 py-4">
            <Link
              to="/app/estimates"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Estimates
            </Link>
            <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
              <Link
                to="/app/pricing"
                className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
              >
                Pricing
              </Link>
              <Link
                to="/app/team"
                className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
              >
                Team
              </Link>
              <Link
                to="/app/settings"
                className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
              >
                Settings
              </Link>
            </RoleGate>
            {user ? (
              <Link
                to="/app/account"
                className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
              >
                {user.firstName} {user.lastName}
                <span className="mx-2 text-rule-soft">·</span>
                {user.role}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              disabled={logout.isPending}
              className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink transition hover:bg-ink hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
            >
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="border border-rule bg-paper-elevated p-8">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">A · welcome</p>
          <h2 className="mt-2 font-sans text-[20px] text-ink">
            {user ? `Welcome back, ${user.firstName}.` : 'Welcome to Quill.'}
          </h2>
          <p className="mt-2 max-w-[60ch] font-sans text-[13px] text-dim">
            Estimates, pricing, and team management land here phase by phase. Phase 1 is auth — you
            just used it. Phase 2 brings the price book and estimate workspace online.
          </p>
        </div>
      </main>
    </div>
  );
}
