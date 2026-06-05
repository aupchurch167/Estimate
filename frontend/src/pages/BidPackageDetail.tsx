import { useParams, Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { useBidPackage, useBidResponses, usePublishBidPackage, useCloseBidPackage } from '@/features/bids/useBids';
import { BID_STATUS_LABELS, BID_REQUEST_STATUS_LABELS, type BidPackageStatus, type BidRequestStatus } from '@/features/bids/types';
import { Badge, Button, Card, Table, TitleBlock } from '@/components/ui';
import { ErrorState, SkeletonCard } from '@/components/states';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_VARIANT: Record<BidPackageStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  CLOSED: 'success',
  CANCELLED: 'danger',
};

const REQUEST_STATUS_VARIANT: Record<BidRequestStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  SENT: 'info',
  VIEWED: 'info',
  RESPONDED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
};

export function BidPackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canCreateEstimate: canEdit } = usePermissions();
  const query = useBidPackage(id!);
  const responsesQuery = useBidResponses(id!);
  const publishMut = usePublishBidPackage();
  const closeMut = useCloseBidPackage();

  if (query.isLoading) return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <SkeletonCard rows={4} />
      </main>
    </div>
  );

  if (query.isError || !query.data) return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <ErrorState message="Failed to load bid package." onRetry={() => query.refetch()} />
      </main>
    </div>
  );

  const pkg = query.data;

  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <TitleBlock
          title={pkg.title}
          subtitle={
            <span>
              Estimate{' '}
              <Link to={`/app/estimates/${pkg.estimateId}`} className="text-text-link hover:underline">
                {pkg.estimate.number}
              </Link>
              {pkg.tradeCanonical && ` · ${pkg.tradeCanonical.name}`}
            </span>
          }
          actions={
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_VARIANT[pkg.status]}>
                {BID_STATUS_LABELS[pkg.status]}
              </Badge>
              {canEdit && pkg.status === 'DRAFT' && (
                <Button
                  variant="primary"
                  loading={publishMut.isPending}
                  onClick={() => publishMut.mutate(pkg.id)}
                >
                  Publish
                </Button>
              )}
              {canEdit && pkg.status === 'PUBLISHED' && (
                <Button
                  variant="secondary"
                  loading={closeMut.isPending}
                  onClick={() => closeMut.mutate(pkg.id)}
                >
                  Close Bidding
                </Button>
              )}
            </div>
          }
        />

        {pkg.description && (
          <Card className="mt-6">
            <div className="p-4">
              <h3 className="font-mono text-[10px] uppercase tracking-label text-dim mb-2">Description</h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{pkg.description}</p>
            </div>
          </Card>
        )}

        <Card className="mt-6" title="Vendors">
          {pkg.bidRequests.length === 0 ? (
            <p className="p-4 text-sm text-dim">No vendors added yet.</p>
          ) : (
            <Table>
              <Table.Head>
                <tr>
                  <Table.Header>Vendor</Table.Header>
                  <Table.Header>Email</Table.Header>
                  <Table.Header>Status</Table.Header>
                  <Table.Header>Sent</Table.Header>
                  <Table.Header>Responded</Table.Header>
                </tr>
              </Table.Head>
              <Table.Body>
                {pkg.bidRequests.map((req) => (
                  <Table.Row key={req.id}>
                    <Table.Cell className="font-medium">{req.vendorName}</Table.Cell>
                    <Table.Cell>{req.vendorEmail}</Table.Cell>
                    <Table.Cell>
                      <Badge variant={REQUEST_STATUS_VARIANT[req.status]}>
                        {BID_REQUEST_STATUS_LABELS[req.status]}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {req.sentAt ? new Date(req.sentAt).toLocaleDateString() : '—'}
                    </Table.Cell>
                    <Table.Cell>
                      {req.respondedAt ? new Date(req.respondedAt).toLocaleDateString() : '—'}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Card>

        {responsesQuery.data && responsesQuery.data.length > 0 && (
          <Card className="mt-6" title="Responses">
            <Table>
              <Table.Head>
                <tr>
                  <Table.Header>Vendor</Table.Header>
                  <Table.Header>Source</Table.Header>
                  <Table.Header>Total</Table.Header>
                  <Table.Header>Line Items</Table.Header>
                  <Table.Header>Submitted</Table.Header>
                </tr>
              </Table.Head>
              <Table.Body>
                {responsesQuery.data.map((resp) => (
                  <Table.Row key={resp.id}>
                    <Table.Cell className="font-medium">
                      {resp.bidRequest.vendorName}
                    </Table.Cell>
                    <Table.Cell>{resp.submissionSource}</Table.Cell>
                    <Table.Cell>
                      {resp.totalAmount
                        ? `$${Number(resp.totalAmount).toLocaleString()}`
                        : '—'}
                    </Table.Cell>
                    <Table.Cell>{resp.lineItems.length}</Table.Cell>
                    <Table.Cell>
                      {new Date(resp.submittedAt).toLocaleDateString()}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Card>
        )}

        <div className="mt-4 flex gap-2 text-sm">
          {pkg.dueDate && (
            <span className="text-dim">
              Due: {new Date(pkg.dueDate).toLocaleDateString()}
            </span>
          )}
          <span className="text-dim">
            Created by {pkg.createdBy.firstName} {pkg.createdBy.lastName} on{' '}
            {new Date(pkg.createdAt).toLocaleDateString()}
          </span>
        </div>
      </main>
    </div>
  );
}
