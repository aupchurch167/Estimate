import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { RoleGate } from '@/components/RoleGate';
import { Avatar, Button } from '@/components/ui';

/**
 * App-wide top header used on every authenticated page (Phase 8.1).
 *
 * Sticky white bar with brand on the left, primary nav in the middle,
 * notifications + user menu on the right. The active route gets a
 * blue pill via NavLink's isActive callback.
 */
export function AppHeader() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border-primary bg-bg-primary">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <NavLink
            to="/app"
            className="text-[18px] font-semibold tracking-tight text-text-primary"
          >
            Quill
          </NavLink>
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
          <NavItem to="/app/bid-packages">Bids</NavItem>
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
              <Avatar
                name={`${user.firstName} ${user.lastName}`}
                size="sm"
                src={user.avatarUrl}
              />
              <span className="hidden sm:inline">
                {user.firstName} {user.lastName}
              </span>
            </NavLink>
          ) : null}
          <Button variant="ghost" size="sm" onClick={handleLogout} loading={logout.isPending}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
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
