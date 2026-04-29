import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { usePermissions } from '@/hooks/usePermissions';
import { InviteModal } from '@/features/team/InviteModal';
import { InvitationTable } from '@/features/team/InvitationTable';
import { UserTable } from '@/features/team/UserTable';
import { useInvitations, useUsers } from '@/features/team/useTeam';

export function TeamPage() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();
  const { canManageUsers } = usePermissions();
  const usersQuery = useUsers();
  const invitationsQuery = useInvitations('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastBanner, setLastBanner] = useState<string | null>(null);

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
          <NotificationBell />
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

  if (!canManageUsers) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <div className="border border-rule bg-paper-elevated p-8">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Access denied</p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">
              Team management is reserved for OWNER and ADMIN.
            </h1>
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

  return (
    <div className="min-h-screen bg-paper">
      {Header}
      <main className="mx-auto flex max-w-[1080px] flex-col gap-6 px-6 py-12">
        <div className="flex items-end justify-between border-b border-rule pb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Team</p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">Members + invitations</h1>
          </div>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90"
          >
            Invite teammate
          </button>
        </div>

        {lastBanner ? (
          <div className="border border-mark-amber/60 bg-paper-elevated px-4 py-3 font-mono text-[11px] uppercase tracking-label text-mark-amber">
            {lastBanner}
          </div>
        ) : null}

        <section className="border border-rule bg-paper-elevated p-6">
          <header className="mb-6 flex items-baseline justify-between border-b border-rule-soft pb-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">A · members</p>
            {usersQuery.data ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                {usersQuery.data.length} total
              </p>
            ) : null}
          </header>
          {usersQuery.isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
          ) : usersQuery.isError || !usersQuery.data ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              Could not load members.
            </p>
          ) : (
            <UserTable users={usersQuery.data} />
          )}
        </section>

        <section className="border border-rule bg-paper-elevated p-6">
          <header className="mb-6 flex items-baseline justify-between border-b border-rule-soft pb-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              B · invitations
            </p>
            {invitationsQuery.data ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                {invitationsQuery.data.length} total
              </p>
            ) : null}
          </header>
          {invitationsQuery.isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
          ) : invitationsQuery.isError || !invitationsQuery.data ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              Could not load invitations.
            </p>
          ) : (
            <InvitationTable invitations={invitationsQuery.data} />
          )}
        </section>
      </main>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={(acceptUrl, dispatched) => {
          if (dispatched) {
            setLastBanner('Invitation sent — they should receive an email shortly.');
          } else {
            setLastBanner(
              `Invitation created. Email not delivered (dev mode). Share this link manually: ${acceptUrl}`,
            );
          }
        }}
      />
    </div>
  );
}
