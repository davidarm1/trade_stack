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
      tenant_id: args.tenant_id ?? null,
      user_id: args.user_id ?? null,
      event: args.event,
      ip: args.ip ?? null,
      user_agent: args.user_agent ?? null,
      metadata: args.metadata ?? null,
    };

    const { error } = await admin.from("audit_log").insert(auditEvent);
    if (error) {
      console.error("[audit] insert failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        event: auditEvent,
      });
    }
  } catch (e) {
    console.error("[audit] insert failed:", {
      message: e instanceof Error ? e.message : "Unknown audit logging error",
      event: {
        tenant_id: args.tenant_id ?? null,
        user_id: args.user_id ?? null,
        event: args.event,
        ip: args.ip ?? null,
        user_agent: args.user_agent ?? null,
        metadata: args.metadata ?? null,
      },
    });
  }
}
