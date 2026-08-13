import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildAuthConfirmUrl } from "@/lib/auth-links";
import {
  sendCompanySetupLinkEmail,
  sendPasswordResetEmail,
} from "@/lib/email";

async function generateLinkAndEmail(args: {
  email: string;
  subjectKind: "reset" | "setup";
  next: string;
}) {
  const trimmed = args.email.trim();
  if (!trimmed) {
    return { error: "Enter your email address." };
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return {
      error:
        args.subjectKind === "setup"
          ? "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable setup-link emails."
          : "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable password-reset emails.",
    };
  }

  try {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: trimmed,
    });

    if (linkErr || !data?.user) {
      const message =
        linkErr?.message ??
        (args.subjectKind === "setup"
          ? "Could not create a setup link."
          : "Could not create a reset link.");
      if (/already.*register|already.*exist|email_exists|duplicate/i.test(message)) {
        return {
          error:
            "That email already has a Supabase Auth account. Ask them to sign in first or check the auth user in Supabase.",
        };
      }
      return { error: message };
    }

    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) {
      return {
        error:
          args.subjectKind === "setup"
            ? "Could not build setup link."
            : "Could not build reset link.",
      };
    }

    const linkUrl = buildAuthConfirmUrl({
      tokenHash,
      type: "recovery",
      next: args.next,
    });

    if (args.subjectKind === "setup") {
      await sendCompanySetupLinkEmail({ to: trimmed, setupUrl: linkUrl });
    } else {
      await sendPasswordResetEmail({ to: trimmed, resetUrl: linkUrl });
    }
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : args.subjectKind === "setup"
            ? "Could not create a setup link."
            : "Could not create a reset link.",
    };
  }
}

export async function generateAndSendPasswordResetEmail(email: string) {
  return generateLinkAndEmail({
    email,
    subjectKind: "reset",
    next: "/auth/reset-password",
  });
}

export async function generateAndSendCompanySetupLink(
  email: string,
  next: string,
) {
  return generateLinkAndEmail({
    email,
    subjectKind: "setup",
    next,
  });
}
