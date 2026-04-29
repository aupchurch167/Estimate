import { FallbackUrl, Layout, MARK_GREEN, MetaRow, PrimaryButton } from './_layout.js';

export interface InvitationAcceptedEmailProps {
  recipientFirstName: string | null;
  acceptedUserName: string;
  acceptedUserEmail: string;
  role: string;
  teamUrl: string;
}

export function InvitationAcceptedEmail({
  recipientFirstName,
  acceptedUserName,
  acceptedUserEmail,
  role,
  teamUrl,
}: InvitationAcceptedEmailProps) {
  return (
    <Layout
      badge="Invitation accepted"
      badgeColor={MARK_GREEN}
      recipientFirstName={recipientFirstName}
      headline={`${acceptedUserName} accepted your invitation.`}
      subheadline="Their account is active and ready to use."
    >
      <MetaRow
        items={[
          { label: 'New member', value: acceptedUserName },
          { label: 'Email', value: acceptedUserEmail },
          { label: 'Role', value: role },
        ]}
      />
      <PrimaryButton href={teamUrl}>View team</PrimaryButton>
      <FallbackUrl url={teamUrl} />
    </Layout>
  );
}

export default InvitationAcceptedEmail;
