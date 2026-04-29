import { createServiceRoleClient } from "@/lib/supabase/admin";

type AuditMetadata = Record<string, unknown>;

export async function logAuditEvent(args: {
  event: string;
  tenant_id?: string | null;
  user_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: AuditMetadata | null;
}) {
  try {
    const admin = createServiceRoleClient();
    const auditEvent = {
      p_tenant_id: args.tenant_id ?? null,
      p_user_id: args.user_id ?? null,
      p_event: args.event,
      p_ip: args.ip ?? null,
      p_user_agent: args.user_agent ?? null,
      p_metadata: args.metadata ?? null,
    };

    const { error } = await admin.rpc("insert_audit_log", auditEvent);
    if (error) {
      console.error("[audit] insert RPC failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        event: auditEvent,
      });
    }
  } catch (e) {
    console.error("[audit] insert RPC failed:", {
      message: e instanceof Error ? e.message : "Unknown audit logging error",
      event: {
        p_tenant_id: args.tenant_id ?? null,
        p_user_id: args.user_id ?? null,
        p_event: args.event,
        p_ip: args.ip ?? null,
        p_user_agent: args.user_agent ?? null,
        p_metadata: args.metadata ?? null,
      },
    });
  }
}
