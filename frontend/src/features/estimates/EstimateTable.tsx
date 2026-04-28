import { useNavigate } from 'react-router-dom';
import type { SafeUser } from '@/features/auth/types';
import type { Estimate } from './types';
import { StatusStamp } from './StatusStamp';

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

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      onSortChange(field, order === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, 'desc');
    }
  };

  const arrow = (field: SortField) =>
    sort === field ? (order === 'asc' ? ' ↑' : ' ↓') : '';

  if (estimates.length === 0) {
    return (
      <div className="border border-dashed border-rule bg-paper-elevated p-12 text-center">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">No estimates</p>
        <p className="mt-2 font-sans text-[13px] text-dim">
          Click "New estimate" to start your first one.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse font-sans text-[13px]">
      <thead>
        <tr className="border-b border-rule text-left">
          <ThSortable
            field="number"
            label="Number"
            sort={sort}
            order={order}
            onClick={toggleSort}
            arrow={arrow('number')}
          />
          <Th>Title</Th>
          <Th>Status</Th>
          <Th>Drafter</Th>
          <Th>Reviewer</Th>
          <Th className="text-right">
            <button
              type="button"
              onClick={() => toggleSort('totalSellPrice')}
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Total{arrow('totalSellPrice')}
            </button>
          </Th>
          <Th className="text-right">
            <button
              type="button"
              onClick={() => toggleSort('updatedAt')}
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              Updated{arrow('updatedAt')}
            </button>
          </Th>
        </tr>
      </thead>
      <tbody>
        {estimates.map((e) => (
          <tr
            key={e.id}
            onClick={() => navigate(`/app/estimates/${e.id}`)}
            className="cursor-pointer border-b border-rule-soft last:border-b-0 hover:bg-paper"
          >
            <Td className="py-2 font-mono text-[11px] text-ink">{e.number}</Td>
            <Td className="py-2">
              <p>{e.title}</p>
              {e.clientCompanyName ? (
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                  {e.clientCompanyName}
                </p>
              ) : null}
            </Td>
            <Td className="py-2">
              <StatusStamp status={e.status} />
            </Td>
            <Td className="py-2 font-mono text-[11px] text-dim">{memberLabel(e.drafterId)}</Td>
            <Td className="py-2 font-mono text-[11px] text-dim">{memberLabel(e.reviewerId)}</Td>
            <Td className="py-2 text-right font-mono tabular-nums">
              {fmt(e.totalSellPrice)}
            </Td>
            <Td className="py-2 text-right font-mono text-[11px] text-dim tabular-nums">
              {fmtDate(e.updatedAt)}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
      className={`font-mono text-[10px] uppercase tracking-label text-dim font-normal pb-2 pr-3 ${className}`}
    >
      {children}
    </th>
  );
}

function ThSortable({
  field,
  label,
  sort,
  order,
  onClick,
  arrow,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: SortOrder;
  onClick: (field: SortField) => void;
  arrow: string;
}) {
  void sort;
  void order;
  return (
    <th className="pb-2 pr-3 text-left">
      <button
        type="button"
        onClick={() => onClick(field)}
        className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
      >
        {label}
        {arrow}
      </button>
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
  return <td className={`pr-3 ${className}`}>{children}</td>;
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
