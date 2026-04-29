import { useState } from 'react';
import type { AxiosError } from 'axios';
import type { SafeUser } from '@/features/auth/types';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
} from '@/features/auth/useAuth';
import {
  useChangeUserRole,
  useDeactivateUser,
  useReactivateUser,
  type AdminAssignableRole,
} from './useTeam';

const ASSIGNABLE_ROLES: AdminAssignableRole[] = ['ADMIN', 'ESTIMATOR', 'PM', 'VIEWER'];

/**
 * Roster of org members. Admins (OWNER + ADMIN) get inline actions —
 * change role, deactivate, reactivate. The OWNER row is read-only and
 * the viewer's own row is read-only (you can't demote yourself or
 * deactivate yourself; the backend enforces this too).
 */
export function UserTable({ users }: { users: SafeUser[] }) {
  const { user: me } = useAuthContext();
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [pendingConfirm, setPendingConfirm] = useState<{
    target: SafeUser;
    nextRole?: AdminAssignableRole;
    action: 'change_role' | 'deactivate';
  } | null>(null);

  const changeRole = useChangeUserRole();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();

  if (users.length === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">No members yet.</p>
    );
  }

  const onRoleSelect = (target: SafeUser, nextRole: AdminAssignableRole) => {
    if (target.role === nextRole) return;
    setPendingConfirm({ target, nextRole, action: 'change_role' });
  };

  const onDeactivate = (target: SafeUser) => {
    setPendingConfirm({ target, action: 'deactivate' });
  };

  const onReactivate = (target: SafeUser) => {
    reactivate.mutate({ userId: target.id });
  };

  const closeConfirm = () => setPendingConfirm(null);

  const confirmAction = async () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.action === 'change_role' && pendingConfirm.nextRole) {
      await changeRole
        .mutateAsync({
          userId: pendingConfirm.target.id,
          role: pendingConfirm.nextRole,
        })
        .catch(() => {
          /* error surfaced by banner */
        });
    } else if (pendingConfirm.action === 'deactivate') {
      await deactivate
        .mutateAsync({ userId: pendingConfirm.target.id })
        .catch(() => {});
    }
    if (!changeRole.isError && !deactivate.isError) closeConfirm();
  };

  const errorBanner =
    changeRole.error || deactivate.error || reactivate.error
      ? mapAdminError(
          (changeRole.error ?? deactivate.error ?? reactivate.error) as AxiosError,
        )
      : null;

  return (
    <>
      {errorBanner ? (
        <p
          role="alert"
          className="mb-3 border border-mark-red/60 bg-paper p-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {errorBanner}
        </p>
      ) : null}
      <table className="w-full border-collapse font-sans text-[13px]">
        <thead>
          <tr className="border-b border-rule text-left">
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            {isAdmin ? <Th>Actions</Th> : null}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isMe = me?.id === u.id;
            const isOwner = u.role === 'OWNER';
            const editable = isAdmin && !isMe && !isOwner;
            return (
              <tr
                key={u.id}
                data-testid={`user-row-${u.id}`}
                className="border-b border-rule-soft last:border-b-0"
              >
                <Td className="py-2">
                  {u.firstName} {u.lastName}
                  {isMe ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-dim">
                      (you)
                    </span>
                  ) : null}
                </Td>
                <Td className="py-2 font-mono text-[12px] text-dim">{u.email}</Td>
                <Td className="py-2 font-mono text-[10px] uppercase tracking-label">
                  {editable ? (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        onRoleSelect(u, e.target.value as AdminAssignableRole)
                      }
                      disabled={changeRole.isPending}
                      data-testid={`user-role-select-${u.id}`}
                      className="border border-rule bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    u.role
                  )}
                </Td>
                <Td
                  className={`py-2 font-mono text-[10px] uppercase tracking-label ${
                    u.isActive ? 'text-mark-green' : 'text-mark-red'
                  }`}
                >
                  {u.isActive ? 'Active' : 'Inactive'}
                </Td>
                {isAdmin ? (
                  <Td className="py-2">
                    {editable ? (
                      u.isActive ? (
                        <button
                          type="button"
                          onClick={() => onDeactivate(u)}
                          disabled={deactivate.isPending}
                          data-testid={`user-deactivate-${u.id}`}
                          className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-mark-red disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onReactivate(u)}
                          disabled={reactivate.isPending}
                          data-testid={`user-reactivate-${u.id}`}
                          className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-mark-green disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      )
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pendingConfirm ? (
        <ConfirmModal
          title={
            pendingConfirm.action === 'change_role'
              ? 'Change role'
              : 'Deactivate teammate'
          }
          body={
            pendingConfirm.action === 'change_role' && pendingConfirm.nextRole
              ? `Change ${pendingConfirm.target.firstName} ${pendingConfirm.target.lastName}'s role from ${pendingConfirm.target.role} to ${pendingConfirm.nextRole}?`
              : `Deactivate ${pendingConfirm.target.firstName} ${pendingConfirm.target.lastName}? Their active sessions will be invalidated immediately. You can reactivate later.`
          }
          confirmLabel={
            pendingConfirm.action === 'change_role' ? 'Change role' : 'Deactivate'
          }
          confirmTone={
            pendingConfirm.action === 'deactivate' ? 'danger' : 'primary'
          }
          pending={changeRole.isPending || deactivate.isPending}
          onConfirm={confirmAction}
          onCancel={closeConfirm}
        />
      ) : null}
    </>
  );
}

interface ConfirmModalProps {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone: 'primary' | 'danger';
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmTone,
  pending,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      data-testid="user-confirm-modal"
    >
      <div className="w-full max-w-[480px] border border-ink bg-paper-elevated">
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            Confirm
          </p>
          <p className="mt-1 font-sans text-[14px] text-ink">{title}</p>
        </header>
        <div className="p-5">
          <p className="font-sans text-[13px] leading-relaxed text-ink">{body}</p>
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="user-confirm-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            data-testid="user-confirm-submit"
            className={`border px-4 py-2 font-mono text-[11px] uppercase tracking-label disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmTone === 'danger'
                ? 'border-mark-red bg-mark-red text-ink-inverse hover:bg-mark-red/90'
                : 'border-ink bg-ink text-ink-inverse hover:bg-ink/90'
            }`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function mapAdminError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'cannot_target_self') {
    return 'You cannot apply this action to yourself.';
  }
  if (code === 'owner_role_immutable') {
    return 'OWNER cannot be modified here.';
  }
  if (err.response?.status === 403) {
    return 'You do not have permission to manage team members.';
  }
  return backendErrorMessage(err, 'Could not update teammate.');
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
