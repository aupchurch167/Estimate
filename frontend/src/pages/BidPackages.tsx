import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useBidPackages } from '@/features/bids/useBids';
import { BID_STATUS_LABELS, type BidPackageStatus } from '@/features/bids/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SkeletonRow,
  Table,
  TitleBlock,
} from '@/components/ui';
import { ErrorState } from '@/components/states';

const STATUS_VARIANT: Record<BidPackageStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  CLOSED: 'success',
  CANCELLED: 'danger',
};

export function BidPackagesPage() {
  const { canCreateEstimate: canEdit } = usePermissions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const estimateId = params.get('estimateId') ?? undefined;
  const statusFilter = (params.get('status') as BidPackageStatus) ?? undefined;

  const query = useBidPackages({ estimateId, status: statusFilter });

  const goCreate = () =>
    navigate(estimateId ? `/app/bid-packages/new?estimateId=${estimateId}` : '/app/bid-packages/new');

  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <TitleBlock
          title="Bid Packages"
          subtitle="Solicit and manage sub-contractor bids across your estimates."
          actions={
            canEdit ? (
              <Button onClick={goCreate}>New Bid Package</Button>
            ) : undefined
          }
        />

        <Card className="mt-6">
          {query.isLoading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {query.isError && (
            <ErrorState
              message="Failed to load bid packages."
              onRetry={() => query.refetch()}
            />
          )}

          {query.isSuccess && query.data.length === 0 && (
            <EmptyState
              title="No bid packages"
              description="Create a bid package to start soliciting sub-contractor pricing."
              actionLabel={canEdit ? 'New Bid Package' : undefined}
              onAction={canEdit ? goCreate : undefined}
            />
          )}

          {query.isSuccess && query.data.length > 0 && (
            <Table>
              <Table.Head>
                <tr>
                  <Table.Header>Title</Table.Header>
                  <Table.Header>Estimate</Table.Header>
                  <Table.Header>Trade</Table.Header>
                  <Table.Header>Status</Table.Header>
                  <Table.Header>Due Date</Table.Header>
                  <Table.Header>Vendors</Table.Header>
                  <Table.Header>Created</Table.Header>
                </tr>
              </Table.Head>
              <Table.Body>
                {query.data.map((pkg) => (
                  <Table.Row key={pkg.id}>
                    <Table.Cell>
                      <Link
                        to={`/app/bid-packages/${pkg.id}`}
                        className="text-text-link hover:underline font-medium"
                      >
                        {pkg.title}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <Link
                        to={`/app/estimates/${pkg.estimateId}`}
                        className="text-text-secondary hover:underline"
                      >
                        {pkg.estimate.number}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      {pkg.tradeCanonical?.name ?? pkg.tradeCode ?? '—'}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant={STATUS_VARIANT[pkg.status]}>
                        {BID_STATUS_LABELS[pkg.status]}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {pkg.dueDate
                        ? new Date(pkg.dueDate).toLocaleDateString()
                        : '—'}
                    </Table.Cell>
                    <Table.Cell>{pkg.bidRequests.length}</Table.Cell>
                    <Table.Cell>
                      {new Date(pkg.createdAt).toLocaleDateString()}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Card>
      </main>
    </div>
  );
}
