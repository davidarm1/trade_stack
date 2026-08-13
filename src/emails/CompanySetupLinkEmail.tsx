import { Button, Link, Section, Text } from "@react-email/components";
import { EmailShell, emailStyles } from "./EmailShell";

export function CompanySetupLinkEmail(props: { setupUrl: string }) {
  return (
    <EmailShell
      preview="Continue setting up your Trade Stack Cloud company"
      heading="Continue setting up your Trade Stack Cloud company"
      footerNote={
        <>
          This message was sent by <strong>Trade Stack Cloud</strong>.
        </>
      }
    >
      <Text style={emailStyles.text}>
        We couldn&apos;t finish creating your account with the password you entered.
        Use the link below to verify your email, choose a new password, and
        continue setting up your company.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button style={emailStyles.button} href={props.setupUrl}>
          Continue setup
        </Button>
      </Section>
      <Text style={emailStyles.text}>
        This link expires in 1 hour for your security.
      </Text>
      <Text style={{ ...emailStyles.text, marginBottom: 0 }}>
        If the button does not work, copy and paste this URL into your browser:
      </Text>
      <Text style={{ ...emailStyles.text, marginBottom: 0 }}>
        <Link href={props.setupUrl} style={emailStyles.link}>
          {props.setupUrl}
        </Link>
      </Text>
    </EmailShell>
  );
}
