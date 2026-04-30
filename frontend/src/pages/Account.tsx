import { AppHeader } from '@/components/AppHeader';
import { ProfileForm } from '@/features/account/ProfileForm';
import { PasswordForm } from '@/features/account/PasswordForm';
import { TitleBlock } from '@/components/ui';

export function AccountPage() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <AppHeader />
      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-6">
        <TitleBlock title="Account" subtitle="Profile + security." />
        <ProfileForm />
        <PasswordForm />
      </main>
    </div>
  );
}
