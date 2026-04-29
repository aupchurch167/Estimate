/**
 * Shared layout + design tokens for Quill notification emails.
 *
 * Renders the drafting aesthetic (paper bg, ink border, mono header,
 * uppercase labels) inside a 480px-wide table-like card. We intentionally
 * avoid @react-email/components — InvitationEmail.tsx documents the
 * prismjs cold-start crash that motivates plain JSX with intrinsic
 * elements + inline styles. The output renders cleanly in Gmail, Outlook,
 * and Apple Mail with no additional wrapping.
 */

import type { ReactNode } from 'react';

export const PAPER = '#EDE7D6';
export const PAPER_ELEVATED = '#FDFAF0';
export const INK = '#1A1A1A';
export const DIM = '#6B6B67';
export const RULE_SOFT = '#D6D0C0';
export const MARK_RED = '#9D2932';
export const MARK_AMBER = '#B68A35';
export const MARK_GREEN = '#496B5C';

export const monoUpper = {
  fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
  color: DIM,
  fontSize: '11px',
};

export interface LayoutProps {
  /** "Estimate Approved", "Mention", "Invitation Accepted", etc. */
  badge: string;
  badgeColor?: string;
  /** Greeting line — typically the recipient's first name. */
  recipientFirstName?: string | null;
  /** Hero headline that summarizes the event. */
  headline: string;
  /** Optional secondary line directly under the headline. */
  subheadline?: string;
  children: ReactNode;
}

export function Layout({
  badge,
  badgeColor = DIM,
  recipientFirstName,
  headline,
  subheadline,
  children,
}: LayoutProps) {
  const greeting = recipientFirstName
    ? `Hi ${recipientFirstName},`
    : 'Hi,';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{headline}</title>
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
          <p
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
          </p>
          <p style={{ ...monoUpper, color: badgeColor, marginTop: '4px', marginBottom: 0, textAlign: 'center' }}>
            {badge}
          </p>

          <hr style={{ border: 0, borderTop: `1px solid ${RULE_SOFT}`, margin: '20px 0' }} />

          <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0 }}>{greeting}</p>
          <p style={{ fontSize: '15px', lineHeight: 1.45, marginTop: '12px', marginBottom: 0 }}>
            {headline}
          </p>
          {subheadline ? (
            <p style={{ fontSize: '13px', color: DIM, lineHeight: 1.5, marginTop: '6px', marginBottom: 0 }}>
              {subheadline}
            </p>
          ) : null}

          <div style={{ marginTop: '20px' }}>{children}</div>
        </div>
      </body>
    </html>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '24px', textAlign: 'center' }}>
      <a
        href={href}
        style={{
          ...monoUpper,
          backgroundColor: INK,
          color: PAPER,
          display: 'inline-block',
          padding: '12px 20px',
          textDecoration: 'none',
        }}
      >
        {children}
      </a>
    </div>
  );
}

export function NoteCard({ label, body }: { label: string; body: string }) {
  return (
    <div
      style={{
        marginTop: '20px',
        borderLeft: `3px solid ${RULE_SOFT}`,
        paddingLeft: '12px',
      }}
    >
      <p style={{ ...monoUpper, marginTop: 0, marginBottom: '4px' }}>{label}</p>
      <p
        style={{
          fontSize: '13px',
          color: INK,
          lineHeight: 1.5,
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {body}
      </p>
    </div>
  );
}

export function MetaRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <table
      role="presentation"
      style={{
        marginTop: '16px',
        width: '100%',
        borderCollapse: 'collapse',
      }}
    >
      <tbody>
        {items.map((it, i) => (
          <tr
            key={i}
            style={{
              borderTop: i === 0 ? `1px solid ${RULE_SOFT}` : undefined,
              borderBottom: `1px solid ${RULE_SOFT}`,
            }}
          >
            <td
              style={{
                ...monoUpper,
                padding: '8px 12px 8px 0',
                width: '40%',
                verticalAlign: 'top',
              }}
            >
              {it.label}
            </td>
            <td
              style={{
                fontSize: '13px',
                color: INK,
                padding: '8px 0',
                verticalAlign: 'top',
              }}
            >
              {it.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FallbackUrl({ url }: { url: string }) {
  return (
    <>
      <hr style={{ border: 0, borderTop: `1px solid ${RULE_SOFT}`, margin: '20px 0' }} />
      <p style={{ fontSize: '11px', color: DIM, lineHeight: 1.5, margin: 0 }}>
        If the button doesn't work, paste this URL into your browser:
        <br />
        <span style={{ wordBreak: 'break-all' }}>{url}</span>
      </p>
    </>
  );
}
