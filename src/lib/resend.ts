import { Resend } from "resend";

type InvoiceEmailArgs = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set on the server.`);
  }
  return value;
}

function getInvoiceFromAddress(): string {
  const invoiceFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (invoiceFrom) return invoiceFrom;
  const fallbackFrom = process.env.RESEND_FROM_NOREPLY?.trim();
  if (fallbackFrom) return fallbackFrom;
  throw new Error("RESEND_FROM_EMAIL is not set on the server.");
}

function formatFromHeader(displayName: string | undefined, address: string): string {
  const name = displayName?.trim();
  if (!name) return address;
  const safeName = name.replace(/[<>\r\n]/g, " ").trim();
  return safeName ? `${safeName} <${address}>` : address;
}

export async function sendInvoiceEmail(args: InvoiceEmailArgs): Promise<void> {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const fromAddress = getInvoiceFromAddress();
  const from = formatFromHeader(args.fromName, fromAddress);
  const replyTo = args.replyTo?.trim() || process.env.RESEND_REPLY_TO_EMAIL?.trim();
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    replyTo: replyTo ? [replyTo] : undefined,
    attachments: args.attachments,
  });
  if (error) {
    throw new Error(error.message || "Failed to send email via Resend.");
  }
}
