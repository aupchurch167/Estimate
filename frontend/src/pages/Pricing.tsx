import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useCategories,
  useDebouncedValue,
  useEntries,
  usePriceBooks,
} from '@/features/pricing/usePricing';
import { CategoryList } from '@/features/pricing/CategoryList';
import { EntryTable } from '@/features/pricing/EntryTable';
import { EntryEditor } from '@/features/pricing/EntryEditor';
import { ManageCategoriesModal } from '@/features/pricing/ManageCategoriesModal';
import { CsvImportWizard } from '@/features/pricing/CsvImportWizard';
import { Badge, Button, Card, Input, TitleBlock } from '@/components/ui';
import type { PriceBookEntry } from '@/features/pricing/types';

export function PricingPage() {
  const { canManagePricing } = usePermissions();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [entryEditorOpen, setEntryEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PriceBookEntry | undefined>(undefined);
  const [manageOpen, setManageOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const booksQuery = usePriceBooks();
  const defaultBook = useMemo(
    () => booksQuery.data?.find((b) => b.isDefault) ?? booksQuery.data?.[0],
    [booksQuery.data],
  );
  const priceBookId = defaultBook?.id;

  const categoriesQuery = useCategories(priceBookId);
  const entriesQuery = useEntries(priceBookId, {
    search: debouncedSearch || undefined,
    categoryId: selectedCategoryId,
    page,
    pageSize: 50,
  });

  if (!canManagePricing) {
    return (
      <Shell>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            Access denied
          </p>
          <h1 className="mt-2 text-[20px] font-semibold text-text-primary">
            Pricing is reserved for OWNER and ADMIN.
          </h1>
          <div className="mt-6">
            <Link to="/app">
              <Button variant="secondary" size="sm">
                Back to app
              </Button>
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  if (booksQuery.isLoading) {
    return (
      <Shell>
        <p className="text-[13px] text-text-secondary">Loading…</p>
      </Shell>
    );
  }

  if (booksQuery.isError || !defaultBook) {
    return (
      <Shell>
        <Card>
          <p role="alert" className="text-[13px] text-danger">
            Could not load price books.
          </p>
        </Card>
      </Shell>
    );
  }

  const totalEntries =
    categoriesQuery.data?.reduce((sum, c) => sum + c.entryCount, 0) ?? entriesQuery.data?.total ?? 0;

  return (
    <Shell wide>
      <TitleBlock
        title={defaultBook.name}
        subtitle="Catalog of priced line items the AI and your drafters can pull from."
        badge={defaultBook.isDefault ? <Badge variant="info">Default</Badge> : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              Import CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setManageOpen(true)}
            >
              Manage categories
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingEntry(undefined);
                setEntryEditorOpen(true);
              }}
            >
              New entry
            </Button>
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <Card title="Categories" className="!p-0">
          <div className="p-4">
            {categoriesQuery.isLoading ? (
              <p className="text-[13px] text-text-secondary">Loading…</p>
            ) : (
              <CategoryList
                categories={categoriesQuery.data ?? []}
                selectedId={selectedCategoryId}
                onSelect={(id) => {
                  setSelectedCategoryId(id);
                  setPage(1);
                }}
                totalEntries={totalEntries}
              />
            )}
          </div>
        </Card>

        <Card className="!p-0">
          <div className="flex items-center justify-between gap-4 border-b border-border-primary px-5 py-3">
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search description, code, or AI keywords…"
              className="max-w-[420px]"
            />
            {entriesQuery.data ? (
              <p className="whitespace-nowrap text-[13px] text-text-secondary">
                {entriesQuery.data.total} entries
              </p>
            ) : null}
          </div>

          <div className="p-5">
            {entriesQuery.isLoading ? (
              <p className="text-[13px] text-text-secondary">Loading…</p>
            ) : entriesQuery.isError || !entriesQuery.data ? (
              <p role="alert" className="text-[13px] text-danger">
                Could not load entries.
              </p>
            ) : (
              <>
                <EntryTable
                  priceBookId={defaultBook.id}
                  entries={entriesQuery.data.data}
                  categories={categoriesQuery.data ?? []}
                  onEdit={(entry) => {
                    setEditingEntry(entry);
                    setEntryEditorOpen(true);
                  }}
                />
                {entriesQuery.data.totalPages > 1 ? (
                  <div className="mt-4 flex items-center justify-between border-t border-border-primary pt-3">
                    <p className="text-[13px] text-text-secondary">
                      Page {entriesQuery.data.page} of {entriesQuery.data.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={entriesQuery.data.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={entriesQuery.data.page >= entriesQuery.data.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>

      <EntryEditor
        priceBookId={defaultBook.id}
        open={entryEditorOpen}
        onClose={() => setEntryEditorOpen(false)}
        categories={categoriesQuery.data ?? []}
        entry={editingEntry}
        defaultCategoryId={selectedCategoryId}
      />
      <ManageCategoriesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        priceBookId={defaultBook.id}
        categories={categoriesQuery.data ?? []}
      />
      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        priceBookId={defaultBook.id}
      />
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main
        className={`mx-auto px-6 py-6 ${wide ? 'max-w-[1280px]' : 'max-w-[760px]'}`}
      >
        {children}
      </main>
    </div>
  );
}
