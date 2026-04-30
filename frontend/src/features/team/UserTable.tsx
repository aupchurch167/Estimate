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
    return <p className="px-5 py-4 text-[13px] text-text-secondary">No members yet.</p>;
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
          className="mx-5 mt-4 rounded-md border border-danger/40 bg-danger-light px-3 py-2 text-[13px] text-danger"
        >
          {errorBanner}
        </p>
      ) : null}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border-primary bg-bg-secondary text-left">
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            {isAdmin ? <Th className="text-right">Actions</Th> : null}
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
                className="border-b border-border-primary last:border-b-0 hover:bg-bg-tertiary"
              >
                <Td>
                  <span className="font-medium text-text-primary">
                    {u.firstName} {u.lastName}
                  </span>
                  {isMe ? (
                    <span className="ml-2 text-[12px] text-text-tertiary">(you)</span>
                  ) : null}
                </Td>
                <Td className="text-text-secondary">{u.email}</Td>
                <Td>
                  {editable ? (
                    <select
                      value={u.role}
                      onChange={(e) =>
                        onRoleSelect(u, e.target.value as AdminAssignableRole)
                      }
                      disabled={changeRole.isPending}
                      data-testid={`user-role-select-${u.id}`}
                      className="rounded-md border border-border-secondary bg-bg-primary px-2 py-1 text-[13px] text-text-primary focus-visible:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-text-secondary">{u.role}</span>
                  )}
                </Td>
                <Td>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      u.isActive ? 'text-success' : 'text-text-tertiary'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        u.isActive ? 'bg-success' : 'bg-text-tertiary'
                      }`}
                    />
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </Td>
                {isAdmin ? (
                  <Td className="text-right">
                    {editable ? (
                      u.isActive ? (
                        <button
                          type="button"
                          onClick={() => onDeactivate(u)}
                          disabled={deactivate.isPending}
                          data-testid={`user-deactivate-${u.id}`}
                          className="text-[13px] font-medium text-text-secondary hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onReactivate(u)}
                          disabled={reactivate.isPending}
                          data-testid={`user-reactivate-${u.id}`}
                          className="text-[13px] font-medium text-text-secondary hover:text-success disabled:cursor-not-allowed disabled:opacity-50"
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-text-primary/40 px-4"
      data-testid="user-confirm-modal"
    >
      <div className="w-full max-w-[480px] rounded-lg border border-border-primary bg-bg-primary shadow-md">
        <header className="border-b border-border-primary px-5 py-4">
          <h2 className="text-[16px] font-medium text-text-primary">{title}</h2>
        </header>
        <div className="px-5 py-4">
          <p className="text-[14px] leading-relaxed text-text-primary">{body}</p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border-primary px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            data-testid="user-confirm-cancel"
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            data-testid="user-confirm-submit"
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 ${
              confirmTone === 'danger'
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-primary hover:bg-primary-hover'
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
