/**
 * Invitation email — drafting aesthetic in inline-styled HTML.
 *
 * We render this via @react-email/render but avoid @react-email/components
 * because that package transitively pulls in prismjs, which has broken ESM
 * exports on some Node + Windows combinations and crashes the server on
 * cold start. Plain JSX with intrinsic elements + inline styles is enough
 * for a single transactional email and renders cleanly across mail clients.
 */

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
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Quill invitation</title>
      </head>
      <body
        style={{
          backgroundColor: PAPER,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: INK,
          margin: 0,
          padding: '32px 0',
        }}
      >
        <div
          style={{
            backgroundColor: PAPER_ELEVATED,
            border: `1px solid ${INK}`,
            margin: '0 auto',
            maxWidth: 480,
            padding: '32px',
          }}
        >
          <h1
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
          </h1>
          <p style={{ ...monoUpper, marginTop: '4px', marginBottom: 0, textAlign: 'center' }}>
            You're invited
          </p>

          <hr style={{ border: 0, borderTop: `1px solid ${RULE_SOFT}`, margin: '20px 0' }} />

          <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            <strong>{inviterName}</strong> invited you to join <strong>{orgName}</strong> on Quill
            as a <strong>{role}</strong>.
          </p>
          <p
            style={{
              fontSize: '13px',
              color: DIM,
              lineHeight: 1.5,
              marginTop: '12px',
              marginBottom: 0,
            }}
          >
            Quill is an estimating workspace for commercial construction. Accepting will create
            your account and log you in.
          </p>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <a
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
            </a>
          </div>

          <p
            style={{
              ...monoUpper,
              marginTop: '24px',
              marginBottom: 0,
              textAlign: 'center',
            }}
          >
            Expires {expiresHuman}
          </p>

          <hr style={{ border: 0, borderTop: `1px solid ${RULE_SOFT}`, margin: '20px 0' }} />

          <p style={{ fontSize: '11px', color: DIM, lineHeight: 1.5, margin: 0 }}>
            If the button doesn't work, paste this URL into your browser:
            <br />
            <span style={{ wordBreak: 'break-all' }}>{acceptUrl}</span>
          </p>
        </div>
      </body>
    </html>
  );
}

export default InvitationEmail;
