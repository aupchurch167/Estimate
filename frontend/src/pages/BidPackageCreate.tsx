import { useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useEstimates } from '@/features/estimates/useEstimates';
import {
  useCreateBidPackage,
  useTrades,
  useCoreVendors,
  useAddBidRequest,
  useUploadBidDocument,
} from '@/features/bids/useBids';
import { Badge, Button, Card, TitleBlock, useToast } from '@/components/ui';

interface SelectedVendor {
  key: string;
  coreVendorId?: string;
  vendorName: string;
  vendorEmail: string;
  vendorPhone?: string;
  complianceStatus?: string | null;
}

function coiVariant(status?: string | null): 'success' | 'warning' | 'neutral' {
  if (!status) return 'neutral';
  if (status.toLowerCase() === 'active') return 'success';
  return 'warning';
}

export function BidPackageCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { canCreateEstimate: canEdit } = usePermissions();
  const [params] = useSearchParams();
  const presetEstimateId = params.get('estimateId') ?? '';

  const estimatesQuery = useEstimates({ pageSize: 100, sort: 'updatedAt', order: 'desc' });
  const tradesQuery = useTrades();

  const createPkg = useCreateBidPackage();
  const addRequest = useAddBidRequest();
  const uploadDoc = useUploadBidDocument();

  // ─── Foundation ───
  const [estimateId, setEstimateId] = useState(presetEstimateId);
  const [tradeCanonicalId, setTradeCanonicalId] = useState('');
  const [scope, setScope] = useState('');
  const [dueDate, setDueDate] = useState('');

  // ─── Vendors ───
  const [vendorFilter, setVendorFilter] = useState('');
  const [selected, setSelected] = useState<SelectedVendor[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const vendorsQuery = useCoreVendors(vendorFilter.trim() || undefined);

  // ─── Documents (buffered until the package exists) ───
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = estimatesQuery.data?.data.find((e) => e.id === estimateId);
  const trade = tradesQuery.data?.find((t) => t.id === tradeCanonicalId);

  const derivedTitle = useMemo(() => {
    if (!estimate) return '';
    return trade ? `${estimate.title} · ${trade.name}` : estimate.title;
  }, [estimate, trade]);

  const isSelected = (key: string) => selected.some((v) => v.key === key);

  function toggleDirectoryVendor(vendor: {
    coreVendorId: string;
    name: string;
    email: string | null;
    phone: string | null;
    complianceStatus: string | null;
  }) {
    if (!vendor.email) {
      toast.error(`${vendor.name} has no email on file — add manually.`);
      return;
    }
    const key = vendor.email.toLowerCase();
    setSelected((prev) =>
      prev.some((v) => v.key === key)
        ? prev.filter((v) => v.key !== key)
        : [
            ...prev,
            {
              key,
              coreVendorId: vendor.coreVendorId,
              vendorName: vendor.name,
              vendorEmail: vendor.email!,
              vendorPhone: vendor.phone ?? undefined,
              complianceStatus: vendor.complianceStatus,
            },
          ],
    );
  }

  function addManualVendor() {
    const name = manualName.trim();
    const email = manualEmail.trim().toLowerCase();
    if (!name || !email) {
      toast.error('Vendor name and email are required.');
      return;
    }
    if (isSelected(email)) {
      toast.error('That vendor is already on the list.');
      return;
    }
    setSelected((prev) => [
      ...prev,
      { key: email, vendorName: name, vendorEmail: email, vendorPhone: manualPhone.trim() || undefined },
    ]);
    setManualName('');
    setManualEmail('');
    setManualPhone('');
  }

  function removeVendor(key: string) {
    setSelected((prev) => prev.filter((v) => v.key !== key));
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  async function persist(next: 'draft' | 'preview') {
    if (!estimateId) {
      setError('Choose a project before continuing.');
      return;
    }
    if (next === 'preview' && selected.length === 0) {
      setError('Add at least one vendor before reviewing the email.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const pkg = await createPkg.mutateAsync({
        estimateId,
        title: derivedTitle || estimate?.title || 'Bid package',
        description: scope.trim() || undefined,
        tradeCanonicalId: tradeCanonicalId || undefined,
        tradeCode: trade?.code,
        dueDate: dueDate || undefined,
      });

      for (const v of selected) {
        try {
          await addRequest.mutateAsync({
            bidPackageId: pkg.id,
            coreVendorId: v.coreVendorId,
            vendorName: v.vendorName,
            vendorEmail: v.vendorEmail,
            vendorPhone: v.vendorPhone,
          });
        } catch {
          toast.error(`Couldn't add ${v.vendorName}.`);
        }
      }

      for (const file of files) {
        try {
          await uploadDoc.mutateAsync({ packageId: pkg.id, file });
        } catch {
          toast.error(`Couldn't upload ${file.name}.`);
        }
      }

      navigate(next === 'preview' ? `/app/bid-packages/${pkg.id}/send` : `/app/bid-packages/${pkg.id}`);
    } catch (err) {
      setError(backendErrorMessage(err as AxiosError, 'Could not create bid package.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="min-h-screen bg-bg-secondary">
        <AppHeader />
        <main className="mx-auto max-w-[960px] px-6 py-6">
          <p className="text-sm text-dim">You don't have permission to create bid packages.</p>
        </main>
      </div>
    );
  }

  const directory = vendorsQuery.data?.data ?? [];
  const fmtBytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[960px] px-6 py-6 pb-28">
        <TitleBlock
          title="Request pricing from subs"
          subtitle="New bid package"
        />

        {error && (
          <div
            role="alert"
            className="mt-4 border border-mark-red/60 px-3 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red"
          >
            {error}
          </div>
        )}

        {/* A · Foundation */}
        <Card className="mt-6" title="A · Foundation">
          <div className="grid grid-cols-1 gap-5 p-4 md:grid-cols-2">
            <Field label="Project" htmlFor="bid-estimate">
              <select
                id="bid-estimate"
                className={inputClass}
                value={estimateId}
                onChange={(e) => setEstimateId(e.target.value)}
              >
                <option value="">Select estimate…</option>
                {(estimatesQuery.data?.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number} — {e.title}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Trade" htmlFor="bid-trade">
              <select
                id="bid-trade"
                className={inputClass}
                value={tradeCanonicalId}
                onChange={(e) => setTradeCanonicalId(e.target.value)}
              >
                <option value="">Select trade…</option>
                {(tradesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field label="Scope summary" htmlFor="bid-scope">
                <textarea
                  id="bid-scope"
                  className={inputClass}
                  rows={3}
                  placeholder="What you're asking vendors to price…"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Response deadline" htmlFor="bid-due">
              <input
                id="bid-due"
                type="date"
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        {/* B · Vendors */}
        <Card className="mt-6" title={`B · Vendors${selected.length ? ` · ${selected.length} selected` : ''}`}>
          <div className="space-y-4 p-4">
            {selected.length > 0 && (
              <div className="space-y-2">
                {selected.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center justify-between border border-rule px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-text-primary">{v.vendorName}</span>
                      <span className="text-[13px] text-dim">{v.vendorEmail}</span>
                      {v.complianceStatus && (
                        <Badge variant={coiVariant(v.complianceStatus)}>
                          COI {v.complianceStatus}
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVendor(v.key)}
                      className="font-mono text-[10px] uppercase tracking-label text-mark-red hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {directory.length > 0 && (
              <div>
                <input
                  className={inputClass}
                  placeholder="Filter vendor directory…"
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                />
                <div className="mt-2 max-h-72 overflow-y-auto border border-rule">
                  {directory.map((v) => {
                    const key = v.email?.toLowerCase() ?? v.coreVendorId;
                    return (
                      <label
                        key={v.coreVendorId}
                        className="flex cursor-pointer items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0 hover:bg-bg-secondary"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected(key)}
                          onChange={() =>
                            toggleDirectoryVendor({
                              coreVendorId: v.coreVendorId,
                              name: v.name,
                              email: v.email,
                              phone: v.phone,
                              complianceStatus: v.complianceStatus,
                            })
                          }
                        />
                        <span className="flex-1 text-sm text-text-primary">{v.name}</span>
                        <span className="text-[13px] text-dim">{v.email ?? 'no email'}</span>
                        {v.complianceStatus && (
                          <Badge variant={coiVariant(v.complianceStatus)}>
                            {v.complianceStatus}
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-rule pt-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-label text-dim">
                Add vendor manually
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                <input
                  className={inputClass}
                  placeholder="Vendor name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <input
                  className={inputClass}
                  type="email"
                  placeholder="bids@vendor.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Phone"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                />
                <Button variant="secondary" onClick={addManualVendor}>
                  Add
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* C · Documents */}
        <Card className="mt-6" title="C · Documents">
          <div className="space-y-3 p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-rule px-4 py-8 text-center hover:border-ink">
              <span className="text-sm text-text-primary">Drop files or click to browse</span>
              <span className="mt-1 text-[12px] text-dim">PDF, JPG, PNG up to 200 MB each</span>
              <input
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between border border-rule px-3 py-2"
                  >
                    <span className="text-sm text-text-primary">{f.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-dim">{fmtBytes(f.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="font-mono text-[10px] uppercase tracking-label text-mark-red hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-paper-elevated">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-3">
          <span className="text-[13px] text-dim">
            {selected.length} vendor{selected.length === 1 ? '' : 's'} · {files.length} doc
            {files.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => persist('draft')} loading={submitting}>
              Save as draft
            </Button>
            <Button variant="primary" onClick={() => persist('preview')} loading={submitting}>
              Continue to email preview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
