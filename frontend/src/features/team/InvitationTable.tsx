import { Badge, type BadgeVariant } from '@/components/ui';
import type { InvitationListItem } from './types';
import { useRevokeInvitation } from './useTeam';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function statusVariant(status: InvitationListItem['status']): BadgeVariant {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'ACCEPTED':
      return 'success';
    case 'REVOKED':
    case 'EXPIRED':
      return 'danger';
  }
}

export function InvitationTable({ invitations }: { invitations: InvitationListItem[] }) {
  const revoke = useRevokeInvitation();

  if (invitations.length === 0) {
    return (
      <p className="px-5 py-4 text-[13px] text-text-secondary">No pending invitations.</p>
    );
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-border-primary bg-bg-secondary text-left">
          <Th>Email</Th>
          <Th>Role</Th>
          <Th>Sent</Th>
          <Th>Expires</Th>
          <Th>Status</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {invitations.map((inv) => (
          <tr
            key={inv.id}
            className="border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary"
          >
            <Td className="text-text-primary">{inv.email}</Td>
            <Td className="text-text-secondary">{inv.role}</Td>
            <Td className="text-text-secondary">{formatDate(inv.createdAt)}</Td>
            <Td className="text-text-secondary">{formatDate(inv.expiresAt)}</Td>
            <Td>
              <Badge variant={statusVariant(inv.status)} size="sm">
                {inv.status}
              </Badge>
            </Td>
            <Td className="text-right">
              {inv.status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending}
                  className="text-[13px] font-medium text-text-secondary hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Revoke
                </button>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2 text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}
