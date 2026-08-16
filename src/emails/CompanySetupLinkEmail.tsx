import { Link, Text } from "@react-email/components";
import { TradeCompanyEmail } from "./TradeCompanyEmail";

const textStyle = {
  margin: "0 0 16px",
  fontSize: "16px",
  lineHeight: "26px",
  color: "#0f172a",
} as const;

export function CompanySetupLinkEmail(props: { setupUrl: string }) {
  return (
    <TradeCompanyEmail
      preview="Continue setting up your Trade Stack Cloud company"
      eyebrow="Finish account setup"
      heading="Finish setting up your company"
      companyName="Trade Stack Cloud"
      intro={
        <Text style={textStyle}>
          We couldn&apos;t finish creating your account with the password you entered.
          Use the link below to verify your email, choose a new password, and
          continue setting up your company.
        </Text>
      }
      primaryAction={{ label: "Continue setup", href: props.setupUrl }}
      supportingText={
        <>
          <Text style={textStyle}>This link expires in 1 hour for your security.</Text>
          <Text style={{ ...textStyle, marginBottom: 0 }}>
            If the button does not work, copy and paste this URL into your browser:
          </Text>
          <Text style={{ ...textStyle, marginBottom: 0 }}>
            <Link href={props.setupUrl} style={{ color: "#0f172a", wordBreak: "break-all" }}>
              {props.setupUrl}
            </Link>
          </Text>
        </>
      }
    />
  );
}
