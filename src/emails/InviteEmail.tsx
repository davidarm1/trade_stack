import { Button, Link, Section, Text } from "@react-email/components";
import { EmailShell, emailStyles } from "./EmailShell";

export function InviteEmail(props: {
  tenantName: string;
  role: string;
  inviteUrl: string;
}) {
  const roleLabel = props.role.charAt(0).toUpperCase() + props.role.slice(1);
  const companyName = props.tenantName.trim() || "your team";

  return (
    <EmailShell
      preview={`You’ve been invited to join ${companyName} on Trade Stack Cloud`}
      heading={`You’ve been invited to join ${companyName} on Trade Stack Cloud`}
      footerNote={
        <>
          This invitation was sent by <strong>Trade Stack Cloud</strong> on behalf
          of {companyName}.
        </>
      }
    >
      <Text style={emailStyles.text}>
        Your role: <strong>{roleLabel}</strong>
      </Text>
      <Text style={emailStyles.text}>
        Click the button below to accept your invite and set your password.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button style={emailStyles.button} href={props.inviteUrl}>
          Accept invite &amp; set your password
        </Button>
      </Section>
      <Text style={emailStyles.text}>
        This invitation link may expire. If the button does not work, copy and
        paste this URL into your browser:
      </Text>
      <Text style={{ ...emailStyles.text, marginBottom: 0 }}>
        <Link href={props.inviteUrl} style={emailStyles.link}>
          {props.inviteUrl}
        </Link>
      </Text>
    </EmailShell>
  );
}
