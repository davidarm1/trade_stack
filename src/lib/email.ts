import { createElement } from "react";
import { Resend } from "resend";
import { InviteEmail } from "@/emails/InviteEmail";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";

function getRequiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function getResendClient(): { resend: Resend | null; from: string | null } {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const from = getRequiredEnv("RESEND_FROM_NOREPLY");
  if (!apiKey || !from) {
    console.error("Auth email configuration is missing.", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      required: ["RESEND_API_KEY", "RESEND_FROM_NOREPLY"],
    });
    return { resend: null, from: null };
  }
  return { resend: new Resend(apiKey), from };
}

async function sendAuthEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const { resend, from } = getResendClient();
  if (!resend || !from) return;

  try {
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (error) {
      console.error("Failed to send auth email via Resend.", {
        message: error.message,
        name: error.name,
        to: args.to,
        subject: args.subject,
      });
    }
  } catch (error) {
    console.error("Unexpected error while sending auth email.", {
      error,
      to: args.to,
      subject: args.subject,
    });
  }
}

async function renderEmail(element: React.ReactElement) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

export async function sendInviteEmail(args: {
  to: string;
  tenantName: string;
  role: string;
  inviteUrl: string;
}) {
  const subject = `You’re invited to join ${args.tenantName} on Trade Stack Cloud`;
  const html = await renderEmail(
    createElement(InviteEmail, {
      tenantName: args.tenantName,
      role: args.role,
      inviteUrl: args.inviteUrl,
    }),
  );
  const text = [
    `Trade Stack Cloud`,
    "",
    `You’ve been invited to join ${args.tenantName} on Trade Stack Cloud.`,
    `Your role: ${args.role}`,
    "",
    `Accept invite & set your password: ${args.inviteUrl}`,
    "",
    "This invitation link may expire.",
  ].join("\n");

  await sendAuthEmail({ to: args.to, subject, html, text });
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
}) {
  const subject = "Reset your Trade Stack Cloud password";
  const html = await renderEmail(createElement(PasswordResetEmail, { resetUrl: args.resetUrl }));
  const text = [
    `Trade Stack Cloud`,
    "",
    "You requested a password reset for your Trade Stack Cloud account.",
    "",
    `Reset my password: ${args.resetUrl}`,
    "",
    "This link expires in 1 hour.",
    "If you didn’t request this, you can safely ignore this email.",
  ].join("\n");

  await sendAuthEmail({ to: args.to, subject, html, text });
}
