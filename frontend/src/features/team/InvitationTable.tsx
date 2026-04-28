import type { InvitationListItem } from './types';
import { useRevokeInvitation } from './useTeam';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function statusClasses(status: InvitationListItem['status']): string {
  switch (status) {
    case 'PENDING':
      return 'text-mark-amber border-mark-amber/60';
    case 'ACCEPTED':
      return 'text-mark-green border-mark-green/60';
    case 'REVOKED':
    case 'EXPIRED':
      return 'text-mark-red border-mark-red/60';
  }
}

export function InvitationTable({ invitations }: { invitations: InvitationListItem[] }) {
  const revoke = useRevokeInvitation();

  if (invitations.length === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        No pending invitations.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse font-sans text-[13px]">
      <thead>
        <tr className="border-b border-rule text-left">
          <Th>Email</Th>
          <Th>Role</Th>
          <Th>Sent</Th>
          <Th>Expires</Th>
          <Th>Status</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {invitations.map((inv) => (
          <tr key={inv.id} className="border-b border-rule-soft last:border-b-0">
            <Td className="py-2 font-mono text-[12px] text-dim">{inv.email}</Td>
            <Td className="py-2 font-mono text-[10px] uppercase tracking-label">{inv.role}</Td>
            <Td className="py-2 font-mono text-[11px] text-dim">{formatDate(inv.createdAt)}</Td>
            <Td className="py-2 font-mono text-[11px] text-dim">{formatDate(inv.expiresAt)}</Td>
            <Td className="py-2">
              <span
                className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${statusClasses(inv.status)}`}
              >
                {inv.status}
              </span>
            </Td>
            <Td className="py-2">
              {inv.status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending}
                  className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-mark-red hover:text-mark-red disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Revoke
                </button>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-label text-dim">—</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="font-mono text-[10px] uppercase tracking-label text-dim font-normal pb-2 pr-4">
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
  return <td className={`pr-4 ${className}`}>{children}</td>;
}
