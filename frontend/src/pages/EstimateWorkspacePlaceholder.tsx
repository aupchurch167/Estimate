import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '@/context/useAuthContext';
import { useLogout } from '@/features/auth/useAuth';

/**
 * Bare placeholder so /app/estimates/:id doesn't 404 from 2.9. The real
 * workspace shell lands in 2.10.
 */
export function EstimateWorkspacePlaceholder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, organization } = useAuthContext();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-paper">
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
              className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink transition hover:bg-ink hover:text-ink-inverse"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="border border-dashed border-rule bg-paper-elevated p-12 text-center">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Workspace</p>
          <h1 className="mt-2 font-sans text-[20px] text-ink">Estimate {id}</h1>
          <p className="mt-2 max-w-[60ch] mx-auto font-sans text-[13px] text-dim">
            The 3-panel workspace (sources / conversation / schedule) lands in Phase 2.10. For now
            you can find this estimate in the pipeline list.
          </p>
          <Link
            to="/app/estimates"
            className="mt-6 inline-block border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
          >
            Back to estimates
          </Link>
        </div>
      </main>
    </div>
  );
}
