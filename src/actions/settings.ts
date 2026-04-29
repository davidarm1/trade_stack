"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Tenant } from "@/types/database";

type TenantUpdate = Partial<
  Omit<Tenant, "id" | "created_at" | "updated_at" | "slug">
>;

export async function getSettings() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", ctx.tenantId)
    .maybeSingle();

  if (tErr) return { data: null, error: tErr.message };

  const { data: rows, error: sErr } = await supabase
    .from("settings")
    .select("*")
    .eq("tenant_id", ctx.tenantId);

  if (sErr) return { data: null, error: sErr.message };

  const keyValues: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (r.field_key && r.field_value != null) {
      keyValues[r.field_key] = r.field_value;
    }
  }

  return { data: { tenant, keyValues }, error: null };
}

export async function updateSettings(data: TenantUpdate) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("tenants")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/receipts");
  revalidatePath("/", "layout");
  return { data: row, error: null };
}

export async function getSettingValue(fieldKey: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("settings")
    .select("field_value")
    .eq("tenant_id", ctx.tenantId)
    .eq("field_key", fieldKey)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data?.field_value ?? null, error: null };
}

export async function upsertSettingValue(fieldKey: string, fieldValue: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const now = new Date().toISOString();
  const { data: existing, error: lookupErr } = await supabase
    .from("settings")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("field_key", fieldKey)
    .maybeSingle();

  if (lookupErr) return { data: null, error: lookupErr.message };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("settings")
      .update({ field_value: fieldValue, updated_at: now })
      .eq("id", existing.id)
      .eq("tenant_id", ctx.tenantId)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    revalidatePath("/settings");
    revalidatePath("/quotes");
    revalidatePath("/", "layout");
    return { data, error: null };
  }

  const { data, error } = await supabase
    .from("settings")
    .insert({
      tenant_id: ctx.tenantId,
      field_key: fieldKey,
      field_value: fieldValue,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/quotes");
  revalidatePath("/", "layout");
  return { data, error: null };
}

const LOGO_BUCKET = "tenant-logos";
const STORAGE_BUCKET_SETUP =
  "Logo storage is not set up yet. In the Supabase dashboard, open SQL Editor and run the script from supabase/migrations/20260416150000_storage_tenant_logos.sql (it creates the public bucket tenant-logos and access policies). If you use the CLI: supabase db push. Then try the upload again.";

function isBucketMissingError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("bucket not found") ||
    (m.includes("not found") && m.includes("bucket")) ||
    m.includes("no such bucket") ||
    (m.includes("does not exist") && m.includes("bucket"))
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function logoExtFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

export async function uploadTenantLogo(formData: FormData) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };

  const raw = formData.get("file");
  if (!(raw instanceof File) || raw.size === 0) {
    return { data: null, error: "Choose an image file." };
  }
  if (raw.size > MAX_LOGO_BYTES) {
    return { data: null, error: "Image must be 2MB or smaller." };
  }
  if (!ALLOWED_LOGO_TYPES.has(raw.type)) {
    return { data: null, error: "Use JPEG, PNG, WebP, or GIF." };
  }

  const supabase = await createClient();
  const folder = ctx.tenantId;
  const ext = logoExtFromMime(raw.type);
  const objectPath = `${folder}/logo.${ext}`;

  const { data: listed, error: listErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(folder);
  if (listErr) {
    return {
      data: null,
      error: isBucketMissingError(listErr.message)
        ? STORAGE_BUCKET_SETUP
        : listErr.message,
    };
  }
  if (listed?.length) {
    const paths = listed
      .filter((f) => f.name.startsWith("logo."))
      .map((f) => `${folder}/${f.name}`);
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(LOGO_BUCKET).remove(paths);
      if (rmErr && !isBucketMissingError(rmErr.message)) {
        return { data: null, error: rmErr.message };
      }
      if (rmErr && isBucketMissingError(rmErr.message)) {
        return { data: null, error: STORAGE_BUCKET_SETUP };
      }
    }
  }

  const buf = Buffer.from(await raw.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(objectPath, buf, {
    contentType: raw.type,
    upsert: true,
    cacheControl: "3600",
  });

  if (upErr) {
    return {
      data: null,
      error: isBucketMissingError(upErr.message)
        ? STORAGE_BUCKET_SETUP
        : upErr.message,
    };
  }

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub.publicUrl;

  const { error: dbErr } = await supabase
    .from("tenants")
    .update({
      logo_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId);

  if (dbErr) return { data: null, error: dbErr.message };

  revalidatePath("/settings");
  revalidatePath("/receipts");
  revalidatePath("/quotes");
  revalidatePath("/", "layout");
  return { data: { logoUrl: publicUrl }, error: null };
}

export async function removeTenantLogo() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();
  const folder = ctx.tenantId;

  const { data: listed, error: listErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(folder);
  if (listErr && !isBucketMissingError(listErr.message)) {
    return { data: null, error: listErr.message };
  }
  if (!listErr && listed?.length) {
    const paths = listed
      .filter((f) => f.name.startsWith("logo."))
      .map((f) => `${folder}/${f.name}`);
    if (paths.length) {
      await supabase.storage.from(LOGO_BUCKET).remove(paths);
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      logo_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId);

  if (error) return { data: null, error: error.message };

  const now = new Date().toISOString();
  for (const fieldKey of ["branding_use_logo", "branding_show_logo"] as const) {
    const { data: row } = await supabase
      .from("settings")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("field_key", fieldKey)
      .maybeSingle();
    if (row?.id) {
      await supabase
        .from("settings")
        .update({ field_value: "false", updated_at: now })
        .eq("id", row.id)
        .eq("tenant_id", ctx.tenantId);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/receipts");
  revalidatePath("/quotes");
  revalidatePath("/", "layout");
  return { data: { ok: true }, error: null };
}
