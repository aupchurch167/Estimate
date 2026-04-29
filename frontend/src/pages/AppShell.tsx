import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { RoleGate } from '@/components/RoleGate';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { useShortcut, useShortcutSequence } from '@/hooks/useShortcut';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { Avatar, Button, TitleBlock } from '@/components/ui';

export function AppShell() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // App-wide keyboard shortcuts (Phase 8.3).
  useShortcut('?', () => setShortcutsOpen(true));
  useShortcutSequence('g d', () => navigate('/app'));
  useShortcutSequence('g e', () => navigate('/app/estimates'));

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg-secondary">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-border-primary bg-bg-primary">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-[18px] font-semibold tracking-tight text-text-primary">
              Quill
            </span>
            {organization ? (
              <span className="hidden border-l border-border-primary pl-6 text-[13px] text-text-secondary sm:block">
                {organization.name}
              </span>
            ) : null}
          </div>
          <nav className="flex items-center gap-1">
            <NavItem to="/app" end>
              Dashboard
            </NavItem>
            <NavItem to="/app/estimates">Estimates</NavItem>
            <RoleGate allowedRoles={['OWNER', 'ADMIN']}>
              <NavItem to="/app/pricing">Pricing</NavItem>
              <NavItem to="/app/team">Team</NavItem>
              <NavItem to="/app/settings">Settings</NavItem>
            </RoleGate>
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {user ? (
              <NavLink
                to="/app/account"
                className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              >
                <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" src={user.avatarUrl} />
                <span className="hidden sm:inline">
                  {user.firstName} {user.lastName}
                </span>
              </NavLink>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              loading={logout.isPending}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1280px] px-6 py-6" tabIndex={-1}>
        <TitleBlock
          title={user ? `Welcome back, ${user.firstName}.` : 'Welcome to Quill.'}
          subtitle="Here's what's happening across your pipeline."
          noBorder
          className="mb-6 pb-0"
        />
        <Dashboard />
      </main>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

function NavItem({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors duration-fast ${
          isActive
            ? 'bg-primary-light text-primary'
            : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
