import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { IdentitySection } from '@/features/settings/IdentitySection';
import { BrandingSection } from '@/features/settings/BrandingSection';
import { WorkflowSection } from '@/features/settings/WorkflowSection';
import { AISection } from '@/features/settings/AISection';
import { DefaultsSection } from '@/features/settings/DefaultsSection';
import { useOrganization } from '@/features/settings/useOrganization';

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();
  const { canManageOrg } = usePermissions();
  const orgQuery = useOrganization();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  const Header = (
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
  );

  if (!canManageOrg) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <div className="border border-rule bg-paper-elevated p-8">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              Access denied
            </p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">
              Settings are reserved for OWNER and ADMIN.
            </h1>
            <p className="mt-2 max-w-[60ch] font-sans text-[13px] text-dim">
              Ask an organization admin to make changes here, or head back to the app.
            </p>
            <Link
              to="/app"
              className="mt-6 inline-block border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
            >
              Back to app
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (orgQuery.isLoading) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
        </main>
      </div>
    );
  }

  if (orgQuery.isError || !orgQuery.data || !orgQuery.data.settings) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <div
            role="alert"
            className="border border-mark-red/60 bg-paper-elevated p-6 font-mono text-[11px] uppercase tracking-label text-mark-red"
          >
            Could not load org settings. Try again or contact support.
          </div>
        </main>
      </div>
    );
  }

  const { organization: org, settings } = orgQuery.data;

  return (
    <div className="min-h-screen bg-paper">
      {Header}
      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-12">
        <div className="border-b border-rule pb-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Settings</p>
          <h1 className="mt-2 font-sans text-[20px] text-ink">Organization</h1>
        </div>
        <IdentitySection organization={org} settings={settings} />
        <BrandingSection settings={settings} />
        <WorkflowSection settings={settings} />
        <AISection settings={settings} />
        <DefaultsSection settings={settings} />
      </main>
    </div>
  );
}
