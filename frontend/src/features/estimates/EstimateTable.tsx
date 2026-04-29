import { useNavigate } from 'react-router-dom';
import type { SafeUser } from '@/features/auth/types';
import type { Estimate } from './types';
import { Badge, Table } from '@/components/ui';

export type SortField = 'updatedAt' | 'createdAt' | 'number' | 'totalSellPrice';
export type SortOrder = 'asc' | 'desc';

interface EstimateTableProps {
  estimates: Estimate[];
  members: SafeUser[];
  sort: SortField;
  order: SortOrder;
  onSortChange: (sort: SortField, order: SortOrder) => void;
}

export function EstimateTable({
  estimates,
  members,
  sort,
  order,
  onSortChange,
}: EstimateTableProps) {
  const navigate = useNavigate();
  const memberLabel = (id: string | null) => {
    if (!id) return '—';
    const m = members.find((u) => u.id === id);
    return m ? `${m.firstName} ${m.lastName}` : '—';
  };

  const sortHeader = (field: SortField) => {
    const direction = sort === field ? order : undefined;
    return {
      sort: direction,
      onSort: () => onSortChange(field, sort === field && order === 'desc' ? 'asc' : 'desc'),
    };
  };

  return (
    <Table>
      <Table.Head>
        <tr>
          <Table.Header {...sortHeader('number')}>Number</Table.Header>
          <Table.Header>Title</Table.Header>
          <Table.Header>Status</Table.Header>
          <Table.Header>Drafter</Table.Header>
          <Table.Header>Reviewer</Table.Header>
          <Table.Header {...sortHeader('totalSellPrice')} className="text-right">
            Total
          </Table.Header>
          <Table.Header {...sortHeader('updatedAt')} className="text-right">
            Updated
          </Table.Header>
        </tr>
      </Table.Head>
      <Table.Body>
        {estimates.map((e) => (
          <Table.Row key={e.id} onRowClick={() => navigate(`/app/estimates/${e.id}`)}>
            <Table.Cell className="font-mono text-[12px] text-text-secondary">
              {e.number}
            </Table.Cell>
            <Table.Cell>
              <p className="font-medium text-text-primary">{e.title}</p>
              {e.clientCompanyName ? (
                <p className="text-[12px] text-text-tertiary">{e.clientCompanyName}</p>
              ) : null}
            </Table.Cell>
            <Table.Cell>
              <Badge status={e.status} size="sm">
                {e.status.replace('_', ' ').toLowerCase()}
              </Badge>
            </Table.Cell>
            <Table.Cell className="text-[13px] text-text-secondary">
              {memberLabel(e.drafterId)}
            </Table.Cell>
            <Table.Cell className="text-[13px] text-text-secondary">
              {memberLabel(e.reviewerId)}
            </Table.Cell>
            <Table.Cell className="text-right font-medium tabular-nums">
              {fmt(e.totalSellPrice)}
            </Table.Cell>
            <Table.Cell className="text-right text-[13px] tabular-nums text-text-tertiary">
              {fmtDate(e.updatedAt)}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

function fmt(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
