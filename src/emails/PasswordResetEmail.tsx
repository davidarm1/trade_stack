import { Link, Text } from "@react-email/components";
import { TradeCompanyEmail } from "./TradeCompanyEmail";

const textStyle = {
  margin: "0 0 16px",
  fontSize: "16px",
  lineHeight: "26px",
  color: "#0f172a",
} as const;

export function PasswordResetEmail(props: { resetUrl: string }) {
  return (
    <TradeCompanyEmail
      preview="Reset your Trade Stack Cloud password"
      eyebrow="Password reset"
      heading="Reset your password"
      companyName="Trade Stack Cloud"
      intro={
        <Text style={textStyle}>
          Click the button below to reset your password and return to your account.
        </Text>
      }
      primaryAction={{ label: "Reset my password", href: props.resetUrl }}
      supportingText={
        <>
          <Text style={textStyle}>This link expires in 1 hour for your security.</Text>
          <Text style={textStyle}>
            If you didn’t request this, you can safely ignore this email.
          </Text>
          <Text style={{ ...textStyle, marginBottom: 0 }}>
            If the button does not work, copy and paste this URL into your browser:
          </Text>
          <Text style={{ ...textStyle, marginBottom: 0 }}>
            <Link href={props.resetUrl} style={{ color: "#0f172a", wordBreak: "break-all" }}>
              {props.resetUrl}
            </Link>
          </Text>
        </>
      }
    />
  );
}
