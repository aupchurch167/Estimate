import { FallbackUrl, Layout, MARK_GREEN, MetaRow, NoteCard, PrimaryButton } from './_layout.js';

export interface ReviewApprovedEmailProps {
  recipientFirstName: string | null;
  reviewerName: string;
  estimateNumber: string;
  estimateTitle: string;
  reviewUrl: string;
  note: string | null;
}

export function ReviewApprovedEmail({
  recipientFirstName,
  reviewerName,
  estimateNumber,
  estimateTitle,
  reviewUrl,
  note,
}: ReviewApprovedEmailProps) {
  return (
    <Layout
      badge="Approved"
      badgeColor={MARK_GREEN}
      recipientFirstName={recipientFirstName}
      headline={`${reviewerName} approved estimate ${estimateNumber}.`}
      subheadline={estimateTitle}
    >
      <MetaRow
        items={[
          { label: 'Estimate', value: estimateNumber },
          { label: 'Reviewer', value: reviewerName },
        ]}
      />
      {note ? <NoteCard label="Reviewer note" body={note} /> : null}
      <PrimaryButton href={reviewUrl}>Open in Quill</PrimaryButton>
      <FallbackUrl url={reviewUrl} />
    </Layout>
  );
}

export default ReviewApprovedEmail;
