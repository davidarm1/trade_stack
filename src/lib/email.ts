import { createElement } from "react";
import { Resend } from "resend";
import { InviteEmail } from "@/emails/InviteEmail";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import { CompanySetupLinkEmail } from "@/emails/CompanySetupLinkEmail";

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

export async function renderEmail(element: React.ReactElement) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(element);
}

export async function sendInviteEmail(args: {
  to: string;
  tenantName: string;
  role: string;
  inviteUrl: string;
}) {
  const subject = `Trade Stack Cloud — You’re invited to join ${args.tenantName}`;
  const html = await renderEmail(
    createElement(InviteEmail, {
      tenantName: args.tenantName,
      role: args.role,
      inviteUrl: args.inviteUrl,
    }),
  );
  const text = [
    `You’ve been invited to join ${args.tenantName} on Trade Stack Cloud.`,
    `Role: ${args.role}`,
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
  const subject = "Trade Stack Cloud — Reset your password";
  const html = await renderEmail(
    createElement(PasswordResetEmail, { resetUrl: args.resetUrl }),
  );
  const text = [
    "You requested a password reset for your Trade Stack Cloud account.",
    "",
    `Reset my password: ${args.resetUrl}`,
    "",
    "This link expires in 1 hour for your security.",
    "If you didn’t request this, you can safely ignore this email.",
  ].join("\n");

  await sendAuthEmail({ to: args.to, subject, html, text });
}

export async function sendCompanySetupLinkEmail(args: {
  to: string;
  setupUrl: string;
}) {
  const subject = "Trade Stack Cloud — Continue company setup";
  const html = await renderEmail(
    createElement(CompanySetupLinkEmail, { setupUrl: args.setupUrl }),
  );
  const text = [
    "We couldn’t finish creating your account with the password you entered.",
    "",
    `Continue setup: ${args.setupUrl}`,
    "",
    "This link expires in 1 hour for your security.",
    "If you didn’t request this, you can safely ignore this email.",
  ].join("\n");

  await sendAuthEmail({ to: args.to, subject, html, text });
}

/**
 * One individually-addressed email — for email marketing sends (see
 * src/actions/email-marketing.ts). Unlike sendAuthEmail, this reports
 * success/failure back to the caller so it can be recorded per-recipient
 * in `email_sends`. Reuses the same Resend client/config as auth email —
 * one Resend call per recipient, never a multi-recipient `to: [...]`.
 */
export async function sendMarketingEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const { resend, from } = getResendClient();
  if (!resend || !from) {
    return { success: false, error: "Email is not configured (missing Resend env vars)." };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown send error",
    };
  }
}
