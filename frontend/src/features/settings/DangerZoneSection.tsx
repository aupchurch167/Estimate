import { useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
  useLogout,
} from '@/features/auth/useAuth';
import type { Organization } from '@/features/auth/types';
import { useDeleteOrganization } from './useOrganization';

const CONFIRMATION_PHRASE = 'DELETE';

interface Props {
  organization: Organization;
}

/**
 * Settings · Danger Zone (Phase 7.2).
 *
 * Visible to OWNER + ADMIN; the inner controls are gated to OWNER only —
 * matching the backend's enforcement on DELETE /api/organizations/current.
 *
 * Two cards:
 *   1. Transfer ownership — Coming Soon. The flow needs careful UX
 *      (re-auth, target user, downgrade old OWNER) and the playbook
 *      explicitly defers a full implementation to P2.
 *   2. Delete organization — triple-confirm pattern: open the modal,
 *      type the org name exactly, then type "DELETE" to enable the
 *      submit button. On success we log out and redirect to /login.
 */
export function DangerZoneSection({ organization }: Props) {
  const { user } = useAuthContext();
  const isOwner = user?.role === 'OWNER';
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <section
      data-testid="danger-zone-section"
      className="border border-mark-red/60 bg-paper-elevated p-6"
    >
      <header className="mb-4 border-b border-rule-soft pb-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
          Danger zone
        </p>
        <p className="mt-1 font-sans text-[12px] text-dim">
          Irreversible actions that affect every member of the organization.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div
          data-testid="transfer-ownership-card"
          className="flex flex-col gap-2 border border-rule-soft p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-sans text-[13px] text-ink">Transfer ownership</p>
            <p className="mt-1 font-sans text-[12px] text-dim">
              Promote another member to OWNER. The current OWNER becomes ADMIN.
            </p>
          </div>
          <span
            data-testid="transfer-ownership-coming-soon"
            className="border border-rule-soft px-3 py-1 font-mono text-[10px] uppercase tracking-label text-dim"
          >
            Coming soon
          </span>
        </div>

        <div className="flex flex-col gap-2 border border-mark-red/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-sans text-[13px] text-ink">Delete organization</p>
            <p className="mt-1 font-sans text-[12px] text-dim">
              Soft-deletes the org and signs every member out. Estimates,
              comments, and history are retained but inaccessible. Only the
              OWNER can do this.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={!isOwner}
            data-testid="open-delete-org"
            title={isOwner ? '' : 'Only OWNER can delete the organization'}
            className="border border-mark-red bg-mark-red px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink-inverse hover:bg-mark-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete organization
          </button>
        </div>
      </div>

      {deleteOpen ? (
        <DeleteOrgModal
          organization={organization}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
    </section>
  );
}

function DeleteOrgModal({
  organization,
  onClose,
}: {
  organization: Organization;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const logout = useLogout();
  const del = useDeleteOrganization();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameInput, setNameInput] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const nameMatches = nameInput.trim() === organization.name;
  const phraseMatches = phraseInput.trim() === CONFIRMATION_PHRASE;

  const error = del.error
    ? mapDeleteError(del.error as AxiosError)
    : null;

  const onSubmit = async () => {
    del.reset();
    try {
      await del.mutateAsync({ confirmName: organization.name });
      // Sign out + redirect — the user's session is now invalid anyway.
      await logout.mutateAsync().catch(() => {});
      navigate('/login', { replace: true });
    } catch {
      // banner displays the error
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Delete organization"
      data-testid="delete-org-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 px-4"
    >
      <div className="w-full max-w-[520px] border border-mark-red bg-paper-elevated">
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
            Delete organization
          </p>
          <p className="mt-1 font-sans text-[14px] text-ink">
            This action is permanent.
          </p>
        </header>
        <div className="flex flex-col gap-4 p-5">
          {step === 1 ? (
            <>
              <p className="font-sans text-[13px] leading-relaxed text-ink">
                You are about to delete <strong>{organization.name}</strong>.
                Every member will be signed out immediately and will no
                longer be able to access estimates, comments, pricing, or
                history through Quill.
              </p>
              <p className="font-sans text-[12px] text-dim">
                Confirmation step 1 of 3.
              </p>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <p className="font-sans text-[13px] leading-relaxed text-ink">
                Type the organization name to continue:{' '}
                <span className="font-mono text-[12px] text-ink">
                  {organization.name}
                </span>
              </p>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={organization.name}
                autoFocus
                data-testid="delete-org-name-input"
                className="w-full border border-rule bg-paper px-3 py-2 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
              />
              <p className="font-sans text-[12px] text-dim">
                Confirmation step 2 of 3.
              </p>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <p className="font-sans text-[13px] leading-relaxed text-ink">
                Type <span className="font-mono text-mark-red">{CONFIRMATION_PHRASE}</span> to
                confirm.
              </p>
              <input
                type="text"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder={CONFIRMATION_PHRASE}
                autoFocus
                data-testid="delete-org-phrase-input"
                className="w-full border border-rule bg-paper px-3 py-2 font-mono text-[12px] text-ink focus:border-ink focus:outline-none"
              />
              <p className="font-sans text-[12px] text-dim">
                Confirmation step 3 of 3 — final.
              </p>
            </>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="delete-org-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Cancel
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              data-testid="delete-org-step1-next"
              className="border border-mark-red bg-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-mark-red/90"
            >
              I understand · continue
            </button>
          ) : null}
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!nameMatches}
              data-testid="delete-org-step2-next"
              className="border border-mark-red bg-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-mark-red/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          ) : null}
          {step === 3 ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!phraseMatches || del.isPending}
              data-testid="delete-org-submit"
              className="border border-mark-red bg-mark-red px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-mark-red/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {del.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function mapDeleteError(err: AxiosError): string {
  const code = backendErrorCode(err);
  if (code === 'org_name_mismatch') {
    return 'Organization name did not match — try again.';
  }
  if (err.response?.status === 403) {
    return 'Only the OWNER can delete the organization.';
  }
  return backendErrorMessage(err, 'Could not delete the organization.');
}
