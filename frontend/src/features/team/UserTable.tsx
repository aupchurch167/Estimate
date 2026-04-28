import type { SafeUser } from '@/features/auth/types';

/**
 * Phase 2.4: read-only listing of org members. Active toggle, role change,
 * and soft-delete actions land in 7.1 (Admin tools). Until then this is
 * just a roster.
 */
export function UserTable({ users }: { users: SafeUser[] }) {
  if (users.length === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">No members yet.</p>
    );
  }
  return (
    <table className="w-full border-collapse font-sans text-[13px]">
      <thead>
        <tr className="border-b border-rule text-left">
          <Th>Name</Th>
          <Th>Email</Th>
          <Th>Role</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-rule-soft last:border-b-0">
            <Td className="py-2">
              {u.firstName} {u.lastName}
            </Td>
            <Td className="py-2 font-mono text-[12px] text-dim">{u.email}</Td>
            <Td className="py-2 font-mono text-[10px] uppercase tracking-label">{u.role}</Td>
            <Td
              className={`py-2 font-mono text-[10px] uppercase tracking-label ${
                u.isActive ? 'text-mark-green' : 'text-mark-red'
              }`}
            >
              {u.isActive ? 'Active' : 'Inactive'}
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
