import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';
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
import type { PriceBookEntry } from '@/features/pricing/types';

export function PricingPage() {
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();
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

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  const Header = (
    <header className="border-b-[1.5px] border-ink bg-paper">
      <div className="mx-auto flex max-w-[1280px] items-stretch justify-between px-6">
        <div className="flex items-center gap-6 py-4">
          <Link to="/app" className="font-mono text-[16px] uppercase tracking-title text-ink">
            Quill
          </Link>
          {organization ? (
            <span className="border-l border-rule-soft pl-6 font-mono text-[10px] uppercase tracking-label text-dim">
              {organization.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4 py-4">
          {user ? (
            <Link
              to="/app/account"
              className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
            >
              {user.firstName} {user.lastName}
              <span className="mx-2 text-rule-soft">·</span>
              {user.role}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink transition hover:bg-ink hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );

  if (!canManagePricing) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[760px] px-6 py-12">
          <div className="border border-rule bg-paper-elevated p-8">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Access denied</p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">
              Pricing is reserved for OWNER and ADMIN.
            </h1>
            <Link
              to="/app"
              className="mt-6 inline-block border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
            >
              Back to app
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (booksQuery.isLoading) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[1280px] px-6 py-12">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
        </main>
      </div>
    );
  }

  if (booksQuery.isError || !defaultBook) {
    return (
      <div className="min-h-screen bg-paper">
        {Header}
        <main className="mx-auto max-w-[1280px] px-6 py-12">
          <p
            role="alert"
            className="border border-mark-red/60 bg-paper-elevated p-6 font-mono text-[11px] uppercase tracking-label text-mark-red"
          >
            Could not load price books.
          </p>
        </main>
      </div>
    );
  }

  const totalEntries =
    categoriesQuery.data?.reduce((sum, c) => sum + c.entryCount, 0) ?? entriesQuery.data?.total ?? 0;

  return (
    <div className="min-h-screen bg-paper">
      {Header}
      <main className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="flex items-end justify-between border-b border-rule pb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">Pricing</p>
            <h1 className="mt-2 font-sans text-[20px] text-ink">
              {defaultBook.name}
              {defaultBook.isDefault ? (
                <span className="ml-3 font-mono text-[10px] uppercase tracking-label text-dim">
                  Default
                </span>
              ) : null}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingEntry(undefined);
                setEntryEditorOpen(true);
              }}
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90"
            >
              New entry
            </button>
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              className="border border-ink px-3 py-2 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
            >
              Manage categories
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="border border-ink px-3 py-2 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
            >
              Import CSV
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[240px_1fr] gap-6">
          <aside className="border border-rule bg-paper-elevated p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-label text-dim">
              Categories
            </p>
            {categoriesQuery.isLoading ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
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
          </aside>

          <section className="border border-rule bg-paper-elevated p-6">
            <div className="mb-4 flex items-center justify-between gap-4 border-b border-rule-soft pb-3">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search description, code, or AI keywords…"
                className="w-full max-w-[420px] border-b border-rule bg-transparent py-2 font-sans text-[14px] outline-none focus:border-ink"
              />
              {entriesQuery.data ? (
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                  {entriesQuery.data.total} entries
                </p>
              ) : null}
            </div>

            {entriesQuery.isLoading ? (
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
            ) : entriesQuery.isError || !entriesQuery.data ? (
              <p
                role="alert"
                className="font-mono text-[10px] uppercase tracking-label text-mark-red"
              >
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
                  <div className="mt-4 flex items-center justify-between border-t border-rule-soft pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                      Page {entriesQuery.data.page} of {entriesQuery.data.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={entriesQuery.data.page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={entriesQuery.data.page >= entriesQuery.data.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </main>

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
    </div>
  );
}
