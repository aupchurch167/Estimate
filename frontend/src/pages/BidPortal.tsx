import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { ErrorState } from '@/components/states';

interface PortalData {
  request: {
    id: string;
    vendorName: string;
    vendorEmail: string;
    status: string;
  };
  bidPackage: {
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    estimate: {
      id: string;
      title: string;
      number: string;
      clientCompanyName: string | null;
    };
    tradeCanonical: { name: string; code: string } | null;
  };
  organization: { id: string; name: string };
  response: {
    id: string;
    totalAmount: string | null;
    notes: string | null;
    submittedAt: string;
  } | null;
}

export function BidPortalPage() {
  const { token } = useParams<{ token: string }>();

  const query = useQuery<PortalData, AxiosError>({
    queryKey: ['portal', token],
    queryFn: async () => (await api.get<PortalData>(`/api/portal/bid/${token}`)).data,
    enabled: !!token,
    retry: false,
  });

  const [totalAmount, setTotalAmount] = useState('');
  const [notes, setNotes] = useState('');

  const submitMut = useMutation<unknown, AxiosError>({
    mutationFn: async () =>
      (await api.post(`/api/portal/bid/${token}/respond`, {
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        notes: notes || undefined,
      })).data,
  });

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <ErrorState message="This bid link is invalid or has expired." />
      </div>
    );
  }

  const data = query.data!;
  const alreadyResponded = !!data.response || submitMut.isSuccess;

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Bid Request from
        </p>
        <h1 className="font-mono text-[14px] uppercase tracking-title text-ink">
          {data.organization.name}
        </h1>
      </header>

      <main className="mx-auto max-w-[640px] px-6 py-8">
        <Card className="mb-6">
          <div className="p-5 space-y-3">
            <h2 className="font-mono text-[12px] uppercase tracking-title text-ink">
              {data.bidPackage.title}
            </h2>
            {data.bidPackage.tradeCanonical && (
              <p className="text-sm text-dim">
                Trade: {data.bidPackage.tradeCanonical.code} — {data.bidPackage.tradeCanonical.name}
              </p>
            )}
            <p className="text-sm text-dim">
              Estimate: {data.bidPackage.estimate.number} — {data.bidPackage.estimate.title}
            </p>
            {data.bidPackage.estimate.clientCompanyName && (
              <p className="text-sm text-dim">
                Client: {data.bidPackage.estimate.clientCompanyName}
              </p>
            )}
            {data.bidPackage.dueDate && (
              <p className="text-sm font-medium text-ink">
                Due: {new Date(data.bidPackage.dueDate).toLocaleDateString()}
              </p>
            )}
            {data.bidPackage.description && (
              <div className="mt-3 border-t border-rule pt-3">
                <p className="font-mono text-[10px] uppercase tracking-label text-dim mb-1">
                  Scope Description
                </p>
                <p className="text-sm text-text-primary whitespace-pre-wrap">
                  {data.bidPackage.description}
                </p>
              </div>
            )}
          </div>
        </Card>

        {alreadyResponded ? (
          <Card>
            <div className="p-5 text-center">
              <p className="font-mono text-[12px] uppercase tracking-title text-mark-green mb-2">
                Response submitted
              </p>
              <p className="text-sm text-dim">
                Thank you for your bid. The estimating team will be in touch.
              </p>
              {(data.response?.totalAmount || submitMut.isSuccess) && (
                <p className="mt-2 text-sm text-ink">
                  Total: ${Number(data.response?.totalAmount ?? totalAmount).toLocaleString()}
                </p>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="p-5">
              <h3 className="font-mono text-[12px] uppercase tracking-title text-ink mb-4">
                Submit your bid
              </h3>
              <p className="text-sm text-dim mb-1">
                Submitting as: {data.request.vendorName} ({data.request.vendorEmail})
              </p>

              {submitMut.isError && (
                <div
                  role="alert"
                  className="mt-3 border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
                >
                  Failed to submit response. Please try again.
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitMut.mutate();
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label
                    htmlFor="portal-total"
                    className="block font-mono text-[10px] uppercase tracking-label text-dim mb-1"
                  >
                    Total bid amount ($)
                  </label>
                  <input
                    id="portal-total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label
                    htmlFor="portal-notes"
                    className="block font-mono text-[10px] uppercase tracking-label text-dim mb-1"
                  >
                    Notes / qualifications
                  </label>
                  <textarea
                    id="portal-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full border border-rule bg-paper px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                    placeholder="Include any exclusions, alternates, or conditions…"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    type="submit"
                    loading={submitMut.isPending}
                  >
                    Submit bid
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        )}
      </main>

      <footer className="border-t border-rule px-6 py-4 text-center">
        <p className="font-mono text-[9px] uppercase tracking-label text-dim">
          Powered by Quill — Estimating by {data.organization.name}
        </p>
      </footer>
    </div>
  );
}
