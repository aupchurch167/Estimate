import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { ProfileForm } from '@/features/account/ProfileForm';
import { PasswordForm } from '@/features/account/PasswordForm';

export function AccountPage() {
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
            <Link to="/app" className="font-mono text-[16px] uppercase tracking-title text-ink">
              Quill
            </Link>
            {organization ? (
              <span className="border-l border-rule-soft pl-6 font-mono text-[10px] uppercase tracking-label text-dim">
                {organization.name}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4 py-4">
            <NotificationBell />
            {user ? (
              <span className="font-mono text-[10px] uppercase tracking-label text-dim">
                {user.firstName} {user.lastName}
                <span className="mx-2 text-rule-soft">·</span>
                {user.role}
              </span>
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

      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-12">
        <div className="border-b border-rule pb-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Account</p>
          <h1 className="mt-2 font-sans text-[20px] text-ink">Profile + security</h1>
        </div>
        <ProfileForm />
        <PasswordForm />
      </main>
    </div>
  );
}
