import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/**
 * Table primitives (Phase 8.1).
 *
 * Sub-components: Table, Table.Head, Table.Body, Table.Row, Table.Header,
 * Table.Cell. Wrap in a horizontally-scrollable container at narrow
 * viewports automatically.
 *
 * Sortable headers: pass `sort` ('asc' | 'desc' | undefined) and
 * `onSort` to make the header clickable. The component renders the
 * sort caret and ARIA attributes for you.
 */
function TableRoot({ children, className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="-mx-px overflow-x-auto">
      <table
        data-testid="table"
        className={[
          'w-full min-w-[640px] border-separate border-spacing-0 text-[14px]',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

function Head({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={['bg-bg-secondary', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </thead>
  );
}

function Body({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className ?? ''} {...rest}>
      {children}
    </tbody>
  );
}

interface RowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** When set, the entire row is clickable with a pointer cursor. */
  onRowClick?: () => void;
}

function Row({ onRowClick, className, onClick, children, ...rest }: RowProps) {
  const interactive = onRowClick !== undefined;
  return (
    <tr
      data-testid="table-row"
      onClick={(e) => {
        onClick?.(e);
        if (onRowClick && !e.defaultPrevented) onRowClick();
      }}
      className={[
        interactive ? 'cursor-pointer hover:bg-bg-tertiary' : '',
        'transition-colors duration-fast',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </tr>
  );
}

interface HeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Active sort direction for this column. Renders the caret + sets aria-sort. */
  sort?: 'asc' | 'desc';
  /** When set, the header becomes a button. */
  onSort?: () => void;
}

function Header({ children, sort, onSort, className, ...rest }: HeaderProps) {
  const ariaSort = sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined;
  const Inner: ReactNode = onSort ? (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 text-left font-medium uppercase tracking-[0.06em] text-text-secondary hover:text-text-primary"
    >
      <span>{children}</span>
      {sort === 'asc' ? (
        <span aria-hidden="true">▲</span>
      ) : sort === 'desc' ? (
        <span aria-hidden="true">▼</span>
      ) : (
        <span aria-hidden="true" className="text-text-tertiary">⇅</span>
      )}
    </button>
  ) : (
    <span className="font-medium uppercase tracking-[0.06em] text-text-secondary">{children}</span>
  );
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={[
        'border-b border-border-primary px-4 py-3 text-left text-[12px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {Inner}
    </th>
  );
}

function Cell({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={[
        'border-b border-border-primary px-4 py-3 text-[14px] text-text-primary',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </td>
  );
}

export const Table = Object.assign(TableRoot, {
  Head,
  Body,
  Row,
  Header,
  Cell,
});
