import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { InviteModal } from '@/features/team/InviteModal';
import { InvitationTable } from '@/features/team/InvitationTable';
import { UserTable } from '@/features/team/UserTable';
import { useInvitations, useUsers } from '@/features/team/useTeam';
import { Button, Card, TitleBlock } from '@/components/ui';

export function TeamPage() {
  const { canManageUsers } = usePermissions();
  const usersQuery = useUsers();
  const invitationsQuery = useInvitations('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastBanner, setLastBanner] = useState<string | null>(null);

  if (!canManageUsers) {
    return (
      <Shell>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            Access denied
          </p>
          <h1 className="mt-2 text-[20px] font-semibold text-text-primary">
            Team management is reserved for OWNER and ADMIN.
          </h1>
          <div className="mt-6">
            <Link to="/app">
              <Button variant="secondary" size="sm">
                Back to app
              </Button>
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <TitleBlock
        title="Team"
        subtitle="Members and pending invitations."
        actions={<Button onClick={() => setInviteOpen(true)}>Invite teammate</Button>}
      />

      {lastBanner ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning-light px-3 py-2 text-[13px] text-warning"
        >
          {lastBanner}
        </div>
      ) : null}

      <Card
        title="Members"
        actions={
          usersQuery.data ? (
            <p className="text-[13px] text-text-secondary">{usersQuery.data.length} total</p>
          ) : null
        }
        bodyClassName="!p-0"
      >
        {usersQuery.isLoading ? (
          <p className="px-5 py-4 text-[13px] text-text-secondary">Loading…</p>
        ) : usersQuery.isError || !usersQuery.data ? (
          <p role="alert" className="px-5 py-4 text-[13px] text-danger">
            Could not load members.
          </p>
        ) : (
          <UserTable users={usersQuery.data} />
        )}
      </Card>

      <Card
        title="Invitations"
        actions={
          invitationsQuery.data ? (
            <p className="text-[13px] text-text-secondary">
              {invitationsQuery.data.length} total
            </p>
          ) : null
        }
        bodyClassName="!p-0"
      >
        {invitationsQuery.isLoading ? (
          <p className="px-5 py-4 text-[13px] text-text-secondary">Loading…</p>
        ) : invitationsQuery.isError || !invitationsQuery.data ? (
          <p role="alert" className="px-5 py-4 text-[13px] text-danger">
            Could not load invitations.
          </p>
        ) : (
          <InvitationTable invitations={invitationsQuery.data} />
        )}
      </Card>

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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto flex max-w-[1080px] flex-col gap-6 px-6 py-6">{children}</main>
    </div>
  );
}
