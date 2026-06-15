import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { backendErrorMessage, useCurrentUser } from '@/features/auth/useAuth';
import {
  useBidPackage,
  useUpdateBidPackage,
  usePublishBidPackage,
} from '@/features/bids/useBids';
import { Badge, Button, Card, TitleBlock, useToast } from '@/components/ui';
import { ErrorState, SkeletonCard } from '@/components/states';
import { inputClass } from '@/features/auth/Field';

export function BidPackageSendPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useBidPackage(id!);
  const meQuery = useCurrentUser();
  const updateMut = useUpdateBidPackage();
  const publishMut = usePublishBidPackage();

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pkg = query.data;

  useEffect(() => {
    if (pkg) setNote(pkg.personalNote ?? '');
  }, [pkg]);

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-bg-secondary">
        <AppHeader />
        <main className="mx-auto max-w-[960px] px-6 py-6">
          <SkeletonCard rows={6} />
        </main>
      </div>
    );
  }

  if (query.isError || !pkg) {
    return (
      <div className="min-h-screen bg-bg-secondary">
        <AppHeader />
        <main className="mx-auto max-w-[960px] px-6 py-6">
          <ErrorState message="Failed to load bid package." onRetry={() => query.refetch()} />
        </main>
      </div>
    );
  }

  const me = meQuery.data;
  const orgName = pkg.organization?.name ?? me?.organization.name ?? 'Your company';
  const senderName = me ? `${me.user.firstName} ${me.user.lastName}` : '';
  const replyTo = me?.settings.contactEmail ?? me?.user.email ?? '';
  const firstVendor = pkg.bidRequests[0]?.vendorName?.split(' ')[0] ?? 'there';
  const docs = pkg.bidDocuments ?? [];
  const subject = `Bid request from ${orgName}: ${pkg.title}`;
  const dueLabel = pkg.dueDate ? new Date(pkg.dueDate).toLocaleDateString() : null;

  const alreadySent = pkg.status !== 'DRAFT';

  async function saveNote(): Promise<boolean> {
    if (note === (pkg!.personalNote ?? '')) return true;
    try {
      await updateMut.mutateAsync({ id: pkg!.id, personalNote: note.trim() || null });
      return true;
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not save the note.'));
      return false;
    }
  }

  async function onSaveDraft() {
    setError(null);
    if (await saveNote()) {
      toast.success('Draft saved.');
      navigate(`/app/bid-packages/${pkg!.id}`);
    }
  }

  async function onSend() {
    setError(null);
    if (pkg!.bidRequests.length === 0) {
      setError('Add at least one vendor before sending.');
      return;
    }
    if (!(await saveNote())) return;
    try {
      await publishMut.mutateAsync(pkg!.id);
      toast.success('Bid requests sent.');
      navigate(`/app/bid-packages/${pkg!.id}`);
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not send bid requests.'));
    }
  }

  const busy = updateMut.isPending || publishMut.isPending;

  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[960px] px-6 py-6 pb-28">
        <TitleBlock
          title="Review & send"
          subtitle={
            <span>
              {pkg.title} ·{' '}
              <Link to={`/app/bid-packages/${pkg.id}`} className="text-text-link hover:underline">
                back to package
              </Link>
            </span>
          }
        />

        {error && (
          <div
            role="alert"
            className="mt-4 border border-mark-red/60 px-3 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red"
          >
            {error}
          </div>
        )}

        {alreadySent && (
          <div className="mt-4 border border-rule px-3 py-2 text-[13px] text-dim">
            This package has already been published. Email content is read-only.
          </div>
        )}

        <Card className="mt-6" title={`Recipients · ${pkg.bidRequests.length}`}>
          {pkg.bidRequests.length === 0 ? (
            <p className="p-4 text-sm text-dim">
              No vendors on this package yet. Add some from the{' '}
              <Link to={`/app/bid-packages/${pkg.id}`} className="text-text-link hover:underline">
                package page
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 p-4">
              {pkg.bidRequests.map((r) => (
                <span key={r.id} className="border border-rule px-2 py-1 text-[13px] text-text-primary">
                  {r.vendorName} <span className="text-dim">· {r.vendorEmail}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="mt-6" title="Personal note (optional, appears at top of email)">
          <div className="p-4">
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Add a personal note to all vendors…"
              value={note}
              disabled={alreadySent}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </Card>

        <Card className="mt-6" title="Preview · what each vendor receives">
          <div className="space-y-4 p-4">
            <div className="space-y-1 border-b border-rule pb-3 text-[13px] text-dim">
              <div>
                <span className="text-text-primary">From</span> {senderName} · {orgName} via Quill
              </div>
              {replyTo && (
                <div>
                  <span className="text-text-primary">Reply-to</span> {replyTo}
                </div>
              )}
              <div>
                <span className="text-text-primary">Subject</span> {subject}
              </div>
            </div>

            <p className="text-sm text-text-primary">Hi {firstVendor},</p>
            <p className="text-sm text-text-primary">
              {orgName} is requesting {pkg.tradeCanonical?.name ?? ''} pricing for{' '}
              {pkg.estimate.title}.
            </p>

            {(note.trim() || pkg.description) && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                  {note.trim() ? 'Note' : 'Scope'}
                </p>
                <p className="whitespace-pre-wrap text-sm text-text-primary">
                  {note.trim() || pkg.description}
                </p>
              </div>
            )}

            {dueLabel && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">Response deadline</p>
                <p className="text-sm text-text-primary">{dueLabel}</p>
              </div>
            )}

            <div>
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">Two ways to respond</p>
              <p className="text-sm text-text-primary">1. Submit through the bid portal (link in email)</p>
              <p className="text-sm text-text-primary">2. Reply to the email with your bid + attachments</p>
            </div>

            {docs.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">Attached</p>
                <ul className="text-sm text-text-primary">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                        {d.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-rule pt-3 text-[13px] text-dim">
              Thanks — {senderName}
              {pkg.tradeCanonical && (
                <Badge variant="neutral" className="ml-2">
                  {pkg.tradeCanonical.name}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper-elevated">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-3">
          <span className="text-[13px] text-dim">
            {pkg.bidRequests.length} vendor{pkg.bidRequests.length === 1 ? '' : 's'} · {docs.length} doc
            {docs.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onSaveDraft} loading={busy} disabled={alreadySent}>
              Save as draft
            </Button>
            <Button
              variant="primary"
              onClick={onSend}
              loading={busy}
              disabled={alreadySent || pkg.bidRequests.length === 0}
            >
              Send bid requests
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
