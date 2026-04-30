import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { IdentitySection } from '@/features/settings/IdentitySection';
import { BrandingSection } from '@/features/settings/BrandingSection';
import { WorkflowSection } from '@/features/settings/WorkflowSection';
import { AISection } from '@/features/settings/AISection';
import { AiUsageSection } from '@/features/settings/AiUsageSection';
import { DefaultsSection } from '@/features/settings/DefaultsSection';
import { DangerZoneSection } from '@/features/settings/DangerZoneSection';
import { useOrganization } from '@/features/settings/useOrganization';
import { Button, Card, TitleBlock } from '@/components/ui';

export function SettingsPage() {
  const { canManageOrg } = usePermissions();
  const orgQuery = useOrganization();

  if (!canManageOrg) {
    return (
      <Shell>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            Access denied
          </p>
          <h1 className="mt-2 text-[20px] font-semibold text-text-primary">
            Settings are reserved for OWNER and ADMIN.
          </h1>
          <p className="mt-2 max-w-[60ch] text-[13px] text-text-secondary">
            Ask an organization admin to make changes here, or head back to the app.
          </p>
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

  if (orgQuery.isLoading) {
    return (
      <Shell>
        <p className="text-[13px] text-text-secondary">Loading…</p>
      </Shell>
    );
  }

  if (orgQuery.isError || !orgQuery.data || !orgQuery.data.settings) {
    return (
      <Shell>
        <Card>
          <p role="alert" className="text-[13px] text-danger">
            Could not load org settings. Try again or contact support.
          </p>
        </Card>
      </Shell>
    );
  }

  const { organization: org, settings } = orgQuery.data;

  return (
    <Shell>
      <TitleBlock title="Settings" subtitle="Organization." />
      <IdentitySection organization={org} settings={settings} />
      <BrandingSection settings={settings} />
      <WorkflowSection settings={settings} />
      <AISection settings={settings} />
      <AiUsageSection />
      <DefaultsSection settings={settings} />
      <DangerZoneSection organization={org} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-6">{children}</main>
    </div>
  );
}
