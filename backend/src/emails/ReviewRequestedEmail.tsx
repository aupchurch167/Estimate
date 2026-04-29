import { FallbackUrl, Layout, MetaRow, NoteCard, PrimaryButton } from './_layout.js';

export interface ReviewRequestedEmailProps {
  recipientFirstName: string | null;
  drafterName: string;
  estimateNumber: string;
  estimateTitle: string;
  reviewUrl: string;
  /** True when the drafter is resubmitting after REVISED → IN_REVIEW. */
  isResubmit: boolean;
  note: string | null;
}

export function ReviewRequestedEmail({
  recipientFirstName,
  drafterName,
  estimateNumber,
  estimateTitle,
  reviewUrl,
  isResubmit,
  note,
}: ReviewRequestedEmailProps) {
  const headline = isResubmit
    ? `${drafterName} resubmitted estimate ${estimateNumber} for review.`
    : `${drafterName} submitted estimate ${estimateNumber} for review.`;
  return (
    <Layout
      badge="Review requested"
      recipientFirstName={recipientFirstName}
      headline={headline}
      subheadline={estimateTitle}
    >
      <MetaRow
        items={[
          { label: 'Estimate', value: estimateNumber },
          { label: 'Drafter', value: drafterName },
        ]}
      />
      {note ? <NoteCard label="Note from drafter" body={note} /> : null}
      <PrimaryButton href={reviewUrl}>Open in Quill</PrimaryButton>
      <FallbackUrl url={reviewUrl} />
    </Layout>
  );
}

export default ReviewRequestedEmail;
