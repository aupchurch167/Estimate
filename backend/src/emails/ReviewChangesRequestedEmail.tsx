import { FallbackUrl, Layout, MARK_AMBER, MetaRow, NoteCard, PrimaryButton } from './_layout.js';

export interface ReviewChangesRequestedEmailProps {
  recipientFirstName: string | null;
  reviewerName: string;
  estimateNumber: string;
  estimateTitle: string;
  reviewUrl: string;
  /** Always present — the reviewer must explain what to change. */
  note: string;
}

export function ReviewChangesRequestedEmail({
  recipientFirstName,
  reviewerName,
  estimateNumber,
  estimateTitle,
  reviewUrl,
  note,
}: ReviewChangesRequestedEmailProps) {
  return (
    <Layout
      badge="Changes requested"
      badgeColor={MARK_AMBER}
      recipientFirstName={recipientFirstName}
      headline={`${reviewerName} requested changes on estimate ${estimateNumber}.`}
      subheadline={estimateTitle}
    >
      <MetaRow
        items={[
          { label: 'Estimate', value: estimateNumber },
          { label: 'Reviewer', value: reviewerName },
        ]}
      />
      <NoteCard label="What needs to change" body={note} />
      <PrimaryButton href={reviewUrl}>Open in Quill</PrimaryButton>
      <FallbackUrl url={reviewUrl} />
    </Layout>
  );
}

export default ReviewChangesRequestedEmail;
