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
  tradeName?: string;
  dueDate?: string;
  description?: string;
  personalNote?: string;
  documentNames?: string[];
  portalUrl: string;
  vendorName: string;
}

export function BidInvitationEmail({
  orgName,
  packageTitle,
  tradeName,
  dueDate,
  description,
  personalNote,
  documentNames,
  portalUrl,
  vendorName,
}: Props) {
  const meta = [
    { label: 'Package', value: packageTitle },
    ...(tradeName ? [{ label: 'Trade', value: tradeName }] : []),
    ...(dueDate ? [{ label: 'Due', value: dueDate }] : []),
    ...(documentNames && documentNames.length > 0
      ? [{ label: 'Attached', value: documentNames.join(' · ') }]
      : []),
  ];

  return (
    <Layout
      badge="Bid Request"
      badgeColor={MARK_AMBER}
      recipientFirstName={vendorName.split(' ')[0]}
      headline={`${orgName} is requesting a bid from you.`}
      subheadline={personalNote ?? description ?? undefined}
    >
      <MetaRow items={meta} />
      <PrimaryButton href={portalUrl}>View &amp; respond</PrimaryButton>
      <FallbackUrl url={portalUrl} />
    </Layout>
  );
}
