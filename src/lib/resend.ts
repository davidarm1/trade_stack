import { Resend } from "resend";

type InvoiceEmailArgs = {
  to: string[];
  subject: string;
  html: string;
  text: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set on the server.`);
  }
  return value;
}

export async function sendInvoiceEmail(args: InvoiceEmailArgs): Promise<void> {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const from = getRequiredEnv("RESEND_FROM_EMAIL");
  const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: replyTo ? [replyTo] : undefined,
  });
  if (error) {
    throw new Error(error.message || "Failed to send email via Resend.");
  }
}
