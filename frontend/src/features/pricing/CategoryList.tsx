import type { PriceBookCategory } from './types';

interface CategoryListProps {
  categories: PriceBookCategory[];
  selectedId: string | undefined; // undefined = "All"
  onSelect: (id: string | undefined) => void;
  totalEntries: number;
}

export function CategoryList({
  categories,
  selectedId,
  onSelect,
  totalEntries,
}: CategoryListProps) {
  return (
    <nav aria-label="Categories" className="flex flex-col">
      <Item
        label="All"
        count={totalEntries}
        selected={selectedId === undefined}
        onClick={() => onSelect(undefined)}
      />
      {categories.length === 0 ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-dim">
          No categories yet.
        </p>
      ) : null}
      {categories.map((c) => (
        <Item
          key={c.id}
          label={c.name}
          count={c.entryCount}
          selected={selectedId === c.id}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </nav>
  );
}

function Item({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between border-b border-rule-soft px-2 py-2 text-left transition ${
        selected ? 'bg-paper text-ink' : 'text-dim hover:bg-paper hover:text-ink'
      }`}
    >
      <span
        className={`font-mono text-[11px] uppercase tracking-label ${
          selected ? 'text-ink' : ''
        }`}
      >
        {label}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-dim">{count}</span>
    </button>
  );
}
