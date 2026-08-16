import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";
import { createElement, type ReactNode } from "react";
import { renderEmail } from "@/lib/email";

const ACCENT = "#0f172a";
const MUTED = "#64748b";
const BACKGROUND = "#f8fafc";
const BORDER = "#e2e8f0";
const PRIMARY_BUTTON = "#0f172a";
const SECONDARY_BUTTON = "#ffffff";

const styles = {
  body: {
    margin: 0,
    padding: "24px",
    backgroundColor: BACKGROUND,
    fontFamily:
      'Arial, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: ACCENT,
  },
  container: {
    maxWidth: "640px",
    margin: "0 auto",
  },
  card: {
    overflow: "hidden",
    border: `1px solid ${BORDER}`,
    borderRadius: "18px",
    backgroundColor: "#ffffff",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  accentBar: {
    height: "8px",
    backgroundColor: ACCENT,
  },
  inner: {
    padding: "28px",
  },
  eyebrow: {
    margin: "0 0 6px",
    fontSize: "12px",
    lineHeight: "18px",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: MUTED,
  },
  logoWrap: {
    margin: "0 0 16px",
  },
  logo: {
    display: "block",
    maxWidth: "180px",
    maxHeight: "64px",
    width: "auto",
    height: "auto",
    objectFit: "contain" as const,
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 700,
    color: ACCENT,
  },
  intro: {
    margin: "0 0 16px",
    fontSize: "16px",
    lineHeight: "26px",
    color: ACCENT,
  },
  companyBlock: {
    margin: "0 0 12px",
    fontSize: "15px",
    lineHeight: "24px",
    color: ACCENT,
  },
  actions: {
    margin: "20px 0 8px",
  },
  primaryButton: {
    display: "inline-block",
    backgroundColor: PRIMARY_BUTTON,
    color: "#ffffff",
    textDecoration: "none",
    padding: "12px 18px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "14px",
    lineHeight: "20px",
    margin: "0 12px 12px 0",
  },
  secondaryButton: {
    display: "inline-block",
    backgroundColor: SECONDARY_BUTTON,
    color: ACCENT,
    textDecoration: "none",
    padding: "12px 18px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "14px",
    lineHeight: "20px",
    margin: "0 12px 12px 0",
    border: `1px solid #cbd5e1`,
  },
  supporting: {
    margin: "4px 0 0",
    fontSize: "15px",
    lineHeight: "24px",
    color: ACCENT,
  },
  footerText: {
    margin: "10px 0 0",
    fontSize: "12px",
    lineHeight: "18px",
    color: MUTED,
  },
  footer: {
    padding: "18px 28px 28px",
  },
  hr: {
    borderColor: BORDER,
    margin: 0,
  },
} as const;

export type TradeCompanyEmailProps = {
  preview: string;
  eyebrow: string;
  heading: string;
  companyName: string;
  companyLogoUrl?: string | null;
  companyContactLines?: string[];
  intro: ReactNode;
  primaryAction?: { label: string; href: string };
  secondaryActions?: Array<{ label: string; href: string }>;
  supportingText?: ReactNode;
  footerNote?: ReactNode;
};

export function TradeCompanyEmail(props: TradeCompanyEmailProps) {
  const contactLines = (props.companyContactLines ?? [])
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Html>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <div style={styles.accentBar} />
            <div style={styles.inner}>
              <Text style={styles.eyebrow}>{props.eyebrow}</Text>
              {props.companyLogoUrl ? (
                <p style={styles.logoWrap}>
                  <Img
                    src={props.companyLogoUrl}
                    alt={`${props.companyName} logo`}
                    style={styles.logo}
                  />
                </p>
              ) : null}
              <Heading style={styles.heading}>{props.heading}</Heading>
              <Text style={styles.intro}>{props.intro}</Text>
              {contactLines.length > 0 ? (
                <Text style={styles.companyBlock}>
                  <strong>{props.companyName}</strong>
                  <br />
                  {contactLines.map((line, index) => (
                    <span key={`${line}-${index}`}>
                      {line}
                      {index < contactLines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </Text>
              ) : (
                <Text style={styles.companyBlock}>
                  <strong>{props.companyName}</strong>
                </Text>
              )}
              {(props.primaryAction || (props.secondaryActions?.length ?? 0) > 0) ? (
                <Section style={styles.actions}>
                  {props.primaryAction ? (
                    <Button style={styles.primaryButton} href={props.primaryAction.href}>
                      {props.primaryAction.label}
                    </Button>
                  ) : null}
                  {props.secondaryActions?.map((action) => (
                    <Button
                      key={`${action.label}-${action.href}`}
                      style={styles.secondaryButton}
                      href={action.href}
                    >
                      {action.label}
                    </Button>
                  ))}
                </Section>
              ) : null}
              {props.supportingText ? (
                <Text style={styles.supporting}>{props.supportingText}</Text>
              ) : null}
            </div>
          </Section>
          <Section style={styles.footer}>
            <Hr style={styles.hr} />
            <Text style={styles.footerText}>
              {props.footerNote ?? (
                <>Sent via Trade Stack on behalf of {props.companyName}.</>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderTradeCompanyEmail(props: TradeCompanyEmailProps) {
  return renderEmail(createElement(TradeCompanyEmail, props));
}
