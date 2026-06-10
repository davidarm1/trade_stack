import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const BRAND = "Trade Stack Cloud";
const ACCENT = "#0f172a";
const BUTTON = "#1e293b";
const MUTED = "#64748b";
const BACKGROUND = "#f8fafc";

const styles = {
  main: {
    backgroundColor: BACKGROUND,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    margin: 0,
    padding: "32px 16px",
    color: ACCENT,
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
  },
  header: {
    padding: "0 0 20px",
  },
  brand: {
    margin: 0,
    fontSize: "20px",
    lineHeight: "28px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: ACCENT,
  },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  },
  h1: {
    margin: "0 0 16px",
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 700,
    color: ACCENT,
  },
  text: {
    margin: "0 0 16px",
    fontSize: "16px",
    lineHeight: "26px",
    color: ACCENT,
  },
  strong: {
    fontWeight: 700,
  },
  button: {
    display: "inline-block",
    backgroundColor: BUTTON,
    color: "#ffffff",
    borderRadius: "999px",
    padding: "14px 24px",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "16px",
    lineHeight: "24px",
  },
  buttonText: {
    color: "#ffffff",
    textDecoration: "none",
  },
  link: {
    color: BUTTON,
    wordBreak: "break-all" as const,
  },
  footer: {
    padding: "20px 0 0",
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "0 0 16px",
  },
  footerText: {
    margin: "0 0 8px",
    fontSize: "13px",
    lineHeight: "20px",
    color: ACCENT,
  },
  footerTextMuted: {
    margin: 0,
    fontSize: "13px",
    lineHeight: "20px",
    color: MUTED,
  },
  muted: {
    color: MUTED,
  },
} as const;

export const emailStyles = styles;

export function EmailShell(props: {
  preview: string;
  heading: string;
  children: ReactNode;
  footerNote?: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brand}>{BRAND}</Text>
          </Section>

          <Section style={styles.card}>
            <Heading style={styles.h1}>{props.heading}</Heading>
            {props.children}
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.hr} />
            <Text style={styles.footerText}>
              {props.footerNote ?? (
                <>
                  You’re receiving this email from <strong>{BRAND}</strong>.
                </>
              )}
            </Text>
            <Text style={styles.footerTextMuted}>
              If you need help, reply to this message and we’ll point you in the
              right direction.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
