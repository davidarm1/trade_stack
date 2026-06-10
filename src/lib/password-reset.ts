import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildAuthConfirmUrl } from "@/lib/auth-links";
import { sendPasswordResetEmail } from "@/lib/email";

export async function generateAndSendPasswordResetEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "Enter your email address." };
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return {
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable password-reset emails.",
    };
  }

  try {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: trimmed,
    });

    if (linkErr || !data?.user) {
      const message = linkErr?.message ?? "Could not create a reset link.";
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
      return { error: "Could not build reset link." };
    }

    const resetUrl = buildAuthConfirmUrl({
      tokenHash,
      type: "recovery",
      next: "/auth/reset-password",
    });

    await sendPasswordResetEmail({ to: trimmed, resetUrl });
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not create a reset link.",
    };
  }
}
