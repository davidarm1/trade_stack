import { Link, Text } from "@react-email/components";
import { TradeCompanyEmail } from "./TradeCompanyEmail";

const textStyle = {
  margin: "0 0 16px",
  fontSize: "16px",
  lineHeight: "26px",
  color: "#0f172a",
} as const;

export function InviteEmail(props: {
  tenantName: string;
  role: string;
  inviteUrl: string;
}) {
  const roleLabel = props.role.charAt(0).toUpperCase() + props.role.slice(1);
  const companyName = props.tenantName.trim() || "your team";

  return (
    <TradeCompanyEmail
      preview={`You’ve been invited to join ${companyName} on Trade Stack Cloud`}
      eyebrow={`Invitation for ${companyName}`}
      heading={`Join ${companyName}`}
      companyName={companyName}
      intro={
        <>
          <Text style={textStyle}>
            You’ve been invited to join the team as <strong>{roleLabel}</strong>.
          </Text>
          <Text style={textStyle}>
            Click the button below to accept your invite and set your password.
          </Text>
        </>
      }
      primaryAction={{ label: "Accept invite & set your password", href: props.inviteUrl }}
      supportingText={
        <>
          <Text style={textStyle}>
            This invitation link may expire. If the button does not work, copy and
            paste this URL into your browser:
          </Text>
          <Text style={{ ...textStyle, marginBottom: 0 }}>
            <Link href={props.inviteUrl} style={{ color: "#0f172a", wordBreak: "break-all" }}>
              {props.inviteUrl}
            </Link>
          </Text>
        </>
      }
      footerNote={
        <>
          This invitation was sent by <strong>Trade Stack Cloud</strong> on behalf
          of {companyName}.
        </>
      }
    />
  );
}
