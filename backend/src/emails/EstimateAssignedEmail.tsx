import { FallbackUrl, Layout, MetaRow, PrimaryButton } from './_layout.js';

export interface EstimateAssignedEmailProps {
  recipientFirstName: string | null;
  assignerName: string;
  /** "drafter" or "reviewer" — the role the recipient now holds on this estimate. */
  assignedAs: 'drafter' | 'reviewer';
  estimateNumber: string;
  estimateTitle: string;
  estimateUrl: string;
}

export function EstimateAssignedEmail({
  recipientFirstName,
  assignerName,
  assignedAs,
  estimateNumber,
  estimateTitle,
  estimateUrl,
}: EstimateAssignedEmailProps) {
  return (
    <Layout
      badge={`Assigned as ${assignedAs}`}
      recipientFirstName={recipientFirstName}
      headline={`${assignerName} assigned you to estimate ${estimateNumber}.`}
      subheadline={estimateTitle}
    >
      <MetaRow
        items={[
          { label: 'Estimate', value: estimateNumber },
          { label: 'Role', value: assignedAs === 'drafter' ? 'Drafter' : 'Reviewer' },
          { label: 'Assigned by', value: assignerName },
        ]}
      />
      <PrimaryButton href={estimateUrl}>Open estimate</PrimaryButton>
      <FallbackUrl url={estimateUrl} />
    </Layout>
  );
}

export default EstimateAssignedEmail;
