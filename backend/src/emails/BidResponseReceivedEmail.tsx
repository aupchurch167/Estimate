import {
  Layout,
  PrimaryButton,
  MetaRow,
  FallbackUrl,
  MARK_GREEN,
} from './_layout.js';

interface Props {
  recipientFirstName: string;
  vendorName: string;
  packageTitle: string;
  totalAmount?: string;
  lineItemCount: number;
  packageUrl: string;
}

export function BidResponseReceivedEmail({
  recipientFirstName,
  vendorName,
  packageTitle,
  totalAmount,
  lineItemCount,
  packageUrl,
}: Props) {
  const meta = [
    { label: 'Vendor', value: vendorName },
    { label: 'Package', value: packageTitle },
    ...(totalAmount ? [{ label: 'Total', value: `$${Number(totalAmount).toLocaleString()}` }] : []),
    { label: 'Line items', value: String(lineItemCount) },
  ];

  return (
    <Layout
      badge="Bid Response"
      badgeColor={MARK_GREEN}
      recipientFirstName={recipientFirstName}
      headline={`${vendorName} submitted a bid response.`}
      subheadline={`Package: ${packageTitle}`}
    >
      <MetaRow items={meta} />
      <PrimaryButton href={packageUrl}>Review response</PrimaryButton>
      <FallbackUrl url={packageUrl} />
    </Layout>
  );
}
