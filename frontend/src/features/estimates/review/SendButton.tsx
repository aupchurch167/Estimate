import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import {
  backendErrorCode,
  backendErrorMessage,
} from '@/features/auth/useAuth';
import { canSendEstimate } from '@/lib/permissions';
import type { EstimateDetail } from '@/features/estimates/types';
import {
  useSendEstimate,
  type SendEstimateResult,
  type SendMethod,
} from './useReviewWorkspace';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Send to client" affordance on an APPROVED estimate. Renders only when
 * the viewer is allowed to send (admin always; ESTIMATOR drafter or
 * reviewer when OrgSettings.drafterCanSend — gated on the backend, but
 * mirrored here so the button is hidden when the action would 403).
 *
 * Note: this component does NOT check OrgSettings.drafterCanSend on its
 * own (it's not on EstimateDetail). The backend enforces it; if a
 * disallowed user clicks Send they'll see the 403-mapped error.
 */
export function SendButton({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  if (estimate.status !== 'APPROVED') return null;

  // Optimistic visibility: admins see it always; ESTIMATORs see it when
  // they're related to the estimate (the backend enforces drafterCanSend).
  const allowed = canSendEstimate(
    { id: user.id, role: user.role },
    {
      drafterId: estimate.drafterId,
      reviewerId: estimate.reviewerId,
      status: estimate.status,
    },
    { drafterCanSend: true },
  );
  if (!allowed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="send-estimate"
        className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90"
      >
        Send to client
      </button>
      {open ? (
        <SendDialog
          estimate={estimate}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SendDialog({
  estimate,
  onClose,
}: {
  estimate: EstimateDetail;
  onClose: () => void;
}) {
  const send = useSendEstimate(estimate.id);
  const [method, setMethod] = useState<SendMethod>('email');
  const [recipients, setRecipients] = useState(estimate.clientContactEmail ?? '');
  const [subject, setSubject] = useState(
    `Estimate ${estimate.number} — ${estimate.title}`,
  );
  const [message, setMessage] = useState('');
  // After link/download success we hold on to the result to show the URL
  // (link) or trigger the download tab (download). Cleared when the user
  // closes the dialog.
  const [result, setResult] = useState<SendEstimateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // For email, close after success. For link/download stay open so the
  // user can copy the URL or see the download tab fired.
  useEffect(() => {
    if (!send.isSuccess) return;
    if (send.data?.sendMethod === 'email') {
      onClose();
      return;
    }
    setResult(send.data ?? null);
    if (send.data?.sendMethod === 'download' && typeof window !== 'undefined') {
      window.open(send.data.downloadUrl, '_blank', 'noopener');
    }
  }, [send.isSuccess, send.data, onClose]);

  const list = recipients
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const invalid = method === 'email' ? list.filter((r) => !EMAIL_RX.test(r)) : [];
  const recipientsOk = method !== 'email' || (list.length > 0 && invalid.length === 0);
  const canSubmit = !send.isPending && !result && recipientsOk;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    send.reset();
    try {
      await send.mutateAsync({
        sendMethod: method,
        recipients: method === 'email' ? list : [],
        subject: method === 'email' ? subject.trim() || null : null,
        message: method === 'email' ? message.trim() || null : null,
      });
    } catch {
      // banner inside the dialog
    }
  };

  const onCopy = async () => {
    if (!result?.downloadUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.downloadUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* clipboard write blocked — leave the URL visible for manual copy */
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Send estimate to client"
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      data-testid="send-dialog"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[560px] border border-ink bg-paper-elevated"
      >
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            Send estimate {estimate.number}
          </p>
          <p className="mt-1 font-sans text-[14px] text-ink">
            A SEND snapshot is taken and the estimate is locked.
          </p>
        </header>

        <div className="flex flex-col gap-3 p-5">
          <Field label="Send via" hint={methodHint(method)}>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as SendMethod)}
              disabled={send.isPending || Boolean(result)}
              data-testid="send-method"
              className="w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="email">Email — attach PDF + send to recipients</option>
              <option value="link">Link — generate a 7-day shareable URL</option>
              <option value="download">Download — save the PDF locally</option>
            </select>
          </Field>

          {method === 'email' ? (
            <>
              <Field label="Recipients" hint="Comma- or newline-separated email addresses.">
                <textarea
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  rows={2}
                  disabled={send.isPending}
                  data-testid="send-recipients"
                  placeholder="client@example.com"
                  className="w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
                {invalid.length > 0 ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-mark-red">
                    Invalid: {invalid.join(', ')}
                  </p>
                ) : null}
              </Field>
              <Field label="Subject">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  disabled={send.isPending}
                  data-testid="send-subject"
                  className="w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </Field>
              <Field label="Message" hint="Optional note to the client.">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  disabled={send.isPending}
                  data-testid="send-message"
                  className="w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </Field>
            </>
          ) : null}

          {result?.sendMethod === 'link' ? (
            <Field label="Shareable link" hint="Anyone with this URL can download the PDF for 7 days.">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.downloadUrl}
                  data-testid="send-link-url"
                  className="flex-1 border border-rule bg-paper px-3 py-2 font-mono text-[11px] text-ink focus:border-ink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onCopy}
                  data-testid="send-link-copy"
                  className="border border-rule px-3 py-2 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </Field>
          ) : null}

          {result?.sendMethod === 'download' ? (
            <p
              data-testid="send-download-confirm"
              className="font-mono text-[10px] uppercase tracking-label text-dim"
            >
              Download started in a new tab. The estimate is now marked as sent.
            </p>
          ) : null}

          {send.error ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {mapSendError(send.error as AxiosError)}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="send-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result ? (
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="send-submit"
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {send.isPending ? 'Sending…' : submitLabel(method)}
            </button>
          ) : null}
        </footer>
      </form>
    </div>
  );
}

function submitLabel(method: SendMethod): string {
  switch (method) {
    case 'email':
      return 'Send & mark as sent';
    case 'link':
      return 'Generate link & mark as sent';
    case 'download':
      return 'Download & mark as sent';
  }
}

function methodHint(method: SendMethod): string {
  switch (method) {
    case 'email':
      return 'A PDF is attached and a copy of the link is included in the email body.';
    case 'link':
      return 'No email is sent — the URL stays valid for 7 days.';
    case 'download':
      return 'The PDF opens in a new tab; no email is sent.';
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-label text-dim">{label}</span>
      {children}
      {hint ? (
        <span className="font-mono text-[10px] uppercase tracking-label text-dim">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function mapSendError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (code === 'invalid_status_transition') {
    return 'Estimate state changed — refresh and try again.';
  }
  if (status === 403) {
    return 'You do not have permission to send this estimate.';
  }
  return backendErrorMessage(err, 'Could not send the estimate.');
}
