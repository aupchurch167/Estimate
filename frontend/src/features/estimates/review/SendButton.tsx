import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { canSendEstimate } from '@/lib/permissions';
import type { EstimateDetail } from '@/features/estimates/types';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import {
  useSendEstimate,
  type SendEstimateResult,
  type SendMethod,
} from './useReviewWorkspace';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Send to client" button on an APPROVED estimate. Hidden when the
 * viewer can't send (admin always; ESTIMATOR drafter/reviewer when
 * OrgSettings.drafterCanSend is true). Backend is the source of truth.
 */
export function SendButton({ estimate }: { estimate: EstimateDetail }) {
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);

  if (!user) return null;
  if (estimate.status !== 'APPROVED') return null;

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
      <Button onClick={() => setOpen(true)} data-testid="send-estimate">
        Send to client
      </Button>
      <SendDialog estimate={estimate} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

interface SendDialogProps {
  estimate: EstimateDetail;
  open: boolean;
  onClose: () => void;
}

function SendDialog({ estimate, open, onClose }: SendDialogProps) {
  const send = useSendEstimate(estimate.id);
  const [method, setMethod] = useState<SendMethod>('email');
  const [recipients, setRecipients] = useState(estimate.clientContactEmail ?? '');
  const [subject, setSubject] = useState(`Estimate ${estimate.number} — ${estimate.title}`);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<SendEstimateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state every time the modal closes so re-opening starts clean.
  useEffect(() => {
    if (!open) {
      setMethod('email');
      setMessage('');
      setRecipients(estimate.clientContactEmail ?? '');
      setSubject(`Estimate ${estimate.number} — ${estimate.title}`);
      setResult(null);
      setCopied(false);
      send.reset();
    }
  }, [open, estimate.clientContactEmail, estimate.number, estimate.title, send]);

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

  const onSubmit = async () => {
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

  const errorText = send.error ? mapSendError(send.error as AxiosError) : null;

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send estimate ${estimate.number}`}
      description="A SEND snapshot is taken and the estimate is locked."
      size="md"
      footer={
        result ? (
          <Button variant="secondary" onClick={onClose} data-testid="send-cancel">
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} data-testid="send-cancel">
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={!canSubmit}
              loading={send.isPending}
              data-testid="send-submit"
            >
              {submitLabel(method)}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Send via"
          value={method}
          onChange={(e) => setMethod(e.target.value as SendMethod)}
          disabled={send.isPending || Boolean(result)}
          data-testid="send-method"
          helpText={methodHint(method)}
        >
          <option value="email">Email — attach PDF + send to recipients</option>
          <option value="link">Link — generate a 7-day shareable URL</option>
          <option value="download">Download — save the PDF locally</option>
        </Select>

        {method === 'email' ? (
          <>
            <Textarea
              label="Recipients"
              helpText="Comma- or newline-separated email addresses."
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              rows={2}
              disabled={send.isPending}
              data-testid="send-recipients"
              placeholder="client@example.com"
              error={invalid.length > 0 ? `Invalid: ${invalid.join(', ')}` : null}
            />
            <Input
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              disabled={send.isPending}
              data-testid="send-subject"
            />
            <Textarea
              label="Message"
              helpText="Optional note to the client."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={send.isPending}
              data-testid="send-message"
            />
          </>
        ) : null}

        {result?.sendMethod === 'link' ? (
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-medium text-text-primary">Shareable link</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={result.downloadUrl}
                data-testid="send-link-url"
                className="h-9 flex-1 rounded-md border border-border-secondary bg-bg-tertiary px-3 font-mono text-[12px] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
              <Button variant="secondary" size="md" onClick={onCopy} data-testid="send-link-copy">
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <span className="text-[12px] text-text-tertiary">
              Anyone with this URL can download the PDF for 7 days.
            </span>
          </div>
        ) : null}

        {result?.sendMethod === 'download' ? (
          <p data-testid="send-download-confirm" className="text-[13px] text-text-secondary">
            Download started in a new tab. The estimate is now marked as sent.
          </p>
        ) : null}

        {errorText ? (
          <p role="alert" className="text-[13px] text-danger">
            {errorText}
          </p>
        ) : null}
      </div>
    </Modal>
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
