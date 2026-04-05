"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 63);
  return s || "tenant";
}

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { data: null, error: error.message };
  revalidatePath("/", "layout");
  return { data, error: null };
}

export async function signUp(
  name: string,
  companyName: string,
  email: string,
  password: string,
) {
  const supabase = createClient();
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, company_name: companyName },
    },
  });

  if (signUpError) return { data: null, error: signUpError.message };
  if (!authData.user) return { data: null, error: "Could not create user" };

  const admin = createServiceRoleClient();
  let slug = slugify(companyName);
  const { data: dup } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (dup) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({
      name: companyName,
      slug,
      is_active: true,
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    return {
      data: null,
      error: tenantError?.message ?? "Failed to create tenant",
    };
  }

  const { error: userError } = await admin.from("users").insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    name,
    email,
    role: "owner",
    is_active: true,
  });

  if (userError) {
    return { data: null, error: userError.message };
  }

  revalidatePath("/", "layout");
  return { data: { userId: authData.user.id, tenantId: tenant.id }, error: null };
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: error.message };
  revalidatePath("/", "layout");
  return { data: true, error: null };
}
