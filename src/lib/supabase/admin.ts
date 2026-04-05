import { createClient } from "@supabase/supabase-js";

/**
 * Service role client — use only in trusted server code (e.g. registration bootstrap).
 * TODO: Replace with Edge Function or DB trigger if you prefer not to use service role in the app.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or service role key");
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
