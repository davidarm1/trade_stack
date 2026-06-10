import { Button, Link, Section, Text } from "@react-email/components";
import { EmailShell, emailStyles } from "./EmailShell";

export function PasswordResetEmail(props: { resetUrl: string }) {
  return (
    <EmailShell
      preview="Reset your Trade Stack Cloud password"
      heading="You requested a password reset for your Trade Stack Cloud account"
      footerNote={
        <>
          This message was sent by <strong>Trade Stack Cloud</strong>.
        </>
      }
    >
      <Text style={emailStyles.text}>
        Click the button below to reset your password and return to your account.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button style={emailStyles.button} href={props.resetUrl}>
          Reset my password
        </Button>
      </Section>
      <Text style={emailStyles.text}>
        This link expires in 1 hour for your security.
      </Text>
      <Text style={emailStyles.text}>
        If you didn’t request this, you can safely ignore this email.
      </Text>
      <Text style={{ ...emailStyles.text, marginBottom: 0 }}>
        Or copy and paste this URL into your browser:
      </Text>
      <Text style={{ ...emailStyles.text, marginBottom: 0 }}>
        <Link href={props.resetUrl} style={emailStyles.link}>
          {props.resetUrl}
        </Link>
      </Text>
    </EmailShell>
  );
}
