import { FallbackUrl, Layout, MARK_RED, MetaRow, PrimaryButton } from './_layout.js';

export interface AiRunFailedEmailProps {
  recipientFirstName: string | null;
  estimateNumber: string;
  estimateTitle: string;
  /** Human-readable run kind: "Generate line items", "Follow-up", etc. */
  runTypeLabel: string;
  /** Backend AiUpstreamError code or "internal_error" — used in copy + meta. */
  errorCode: string;
  estimateUrl: string;
}

export function AiRunFailedEmail({
  recipientFirstName,
  estimateNumber,
  estimateTitle,
  runTypeLabel,
  errorCode,
  estimateUrl,
}: AiRunFailedEmailProps) {
  return (
    <Layout
      badge="AI run failed"
      badgeColor={MARK_RED}
      recipientFirstName={recipientFirstName}
      headline={`A ${runTypeLabel.toLowerCase()} run failed on estimate ${estimateNumber}.`}
      subheadline={estimateTitle}
    >
      <MetaRow
        items={[
          { label: 'Estimate', value: estimateNumber },
          { label: 'Run type', value: runTypeLabel },
          { label: 'Error', value: errorCode },
        ]}
      />
      <PrimaryButton href={estimateUrl}>Open estimate</PrimaryButton>
      <FallbackUrl url={estimateUrl} />
    </Layout>
  );
}

export default AiRunFailedEmail;
