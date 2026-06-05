import {
  Layout,
  PrimaryButton,
  MetaRow,
  FallbackUrl,
  MARK_AMBER,
} from './_layout.js';

interface Props {
  orgName: string;
  packageTitle: string;
  dueDate?: string;
  portalUrl: string;
  vendorName: string;
}

export function BidReminderEmail({
  orgName,
  packageTitle,
  dueDate,
  portalUrl,
  vendorName,
}: Props) {
  const meta = [
    { label: 'Package', value: packageTitle },
    ...(dueDate ? [{ label: 'Due', value: dueDate }] : []),
  ];

  return (
    <Layout
      badge="Bid Reminder"
      badgeColor={MARK_AMBER}
      recipientFirstName={vendorName.split(' ')[0]}
      headline={`Reminder: ${orgName} is still waiting on your bid.`}
      subheadline={`Please submit your response for "${packageTitle}" at your earliest convenience.`}
    >
      <MetaRow items={meta} />
      <PrimaryButton href={portalUrl}>View &amp; respond</PrimaryButton>
      <FallbackUrl url={portalUrl} />
    </Layout>
  );
}
