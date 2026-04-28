/**
 * Invitation email — drafting aesthetic ported to inline-styled HTML so it
 * renders consistently in mail clients. React Email handles the
 * cross-client compatibility; we keep the visual language consistent
 * with the in-app Login + Settings cards.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface InvitationEmailProps {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: string; // ISO string
}

const PAPER = '#EDE7D6';
const PAPER_ELEVATED = '#FDFAF0';
const INK = '#1A1A1A';
const DIM = '#6B6B67';
const RULE_SOFT = '#D6D0C0';

const monoUpper = {
  fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  color: DIM,
  fontSize: '11px',
};

export function InvitationEmail({
  orgName,
  inviterName,
  role,
  acceptUrl,
  expiresAt,
}: InvitationEmailProps) {
  const expiresHuman = new Date(expiresAt).toUTCString();

  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {orgName} on Quill.</Preview>
      <Body
        style={{
          backgroundColor: PAPER,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: INK,
          margin: 0,
          padding: '32px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: PAPER_ELEVATED,
            border: `1px solid ${INK}`,
            margin: '0 auto',
            maxWidth: 480,
            padding: '32px',
          }}
        >
          <Heading
            style={{
              ...monoUpper,
              color: INK,
              fontSize: '14px',
              letterSpacing: '0.22em',
              margin: 0,
              textAlign: 'center',
            }}
          >
            Quill
          </Heading>
          <Text style={{ ...monoUpper, marginTop: '4px', textAlign: 'center' }}>
            You're invited
          </Text>

          <Hr style={{ borderColor: RULE_SOFT, margin: '20px 0' }} />

          <Text style={{ fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            <strong>{inviterName}</strong> invited you to join{' '}
            <strong>{orgName}</strong> on Quill as a{' '}
            <strong>{role}</strong>.
          </Text>
          <Text style={{ fontSize: '13px', color: DIM, lineHeight: 1.5, marginTop: '12px' }}>
            Quill is an estimating workspace for commercial construction. Accepting will create
            your account and log you in.
          </Text>

          <Section style={{ marginTop: '24px', textAlign: 'center' }}>
            <Button
              href={acceptUrl}
              style={{
                ...monoUpper,
                backgroundColor: INK,
                color: PAPER,
                display: 'inline-block',
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              Accept invitation →
            </Button>
          </Section>

          <Text style={{ ...monoUpper, marginTop: '24px', textAlign: 'center' }}>
            Expires {expiresHuman}
          </Text>

          <Hr style={{ borderColor: RULE_SOFT, margin: '20px 0' }} />

          <Text style={{ fontSize: '11px', color: DIM, lineHeight: 1.5, margin: 0 }}>
            If the button doesn't work, paste this URL into your browser:
            <br />
            <span style={{ wordBreak: 'break-all' }}>{acceptUrl}</span>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvitationEmail;
