"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext, getCurrentUserRole } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { OnboardingDocument, StaffAcceptance } from "@/types/database";

async function requireDocumentManagerContext() {
  const ctx = await getTenantContext();
  if (!ctx.success) return ctx;
  const role = await getCurrentUserRole();
  if (role !== "owner" && role !== "office") {
    return {
      success: false as const,
      error: "Only owners and office staff can manage onboarding documents.",
    };
  }
  return ctx;
}

export async function getOnboardingDocuments() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("onboarding_documents")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as OnboardingDocument[], error: null };
}

/** Required documents the signed-in user hasn't accepted at the current version yet. */
export async function getOutstandingDocuments() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: docs, error: docsErr } = await supabase
    .from("onboarding_documents")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("required", true);
  if (docsErr) return { data: null, error: docsErr.message };

  const { data: accepted, error: acceptedErr } = await supabase
    .from("staff_acceptances")
    .select("document_id, document_version")
    .eq("tenant_id", ctx.tenantId)
    .eq("membership_id", ctx.membershipId);
  if (acceptedErr) return { data: null, error: acceptedErr.message };

  const acceptedSet = new Set(
    (accepted ?? []).map((a) => `${a.document_id}:${a.document_version}`),
  );
  const outstanding = (docs ?? []).filter(
    (d) => !acceptedSet.has(`${d.id}:${d.version}`),
  );

  return { data: outstanding as OnboardingDocument[], error: null };
}

/** Owner/office view: every required document with each staff member's sign-off status. */
export async function getAcceptanceStatus() {
  const ctx = await requireDocumentManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const [{ data: docs, error: docsErr }, { data: users, error: usersErr }, { data: acceptances, error: accErr }] =
    await Promise.all([
      supabase
        .from("onboarding_documents")
        .select("*")
        .eq("tenant_id", ctx.tenantId)
        .eq("required", true),
      supabase
        .from("users")
        .select("id, name, email")
        .eq("tenant_id", ctx.tenantId)
        .eq("is_active", true),
      supabase
        .from("staff_acceptances")
        .select("*")
        .eq("tenant_id", ctx.tenantId),
    ]);

  if (docsErr) return { data: null, error: docsErr.message };
  if (usersErr) return { data: null, error: usersErr.message };
  if (accErr) return { data: null, error: accErr.message };

  const acceptedSet = new Set(
    (acceptances ?? []).map(
      (a: StaffAcceptance) => `${a.membership_id}:${a.document_id}:${a.document_version}`,
    ),
  );

  return {
    data: {
      documents: (docs ?? []) as OnboardingDocument[],
      users: (users ?? []) as { id: string; name: string | null; email: string | null }[],
      acceptedSet,
    },
    error: null,
  };
}

export async function createOnboardingDocument(args: {
  title: string;
  body: string;
  required: boolean;
}) {
  const ctx = await requireDocumentManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("onboarding_documents")
    .insert({
      tenant_id: ctx.tenantId,
      title: args.title,
      body: args.body,
      required: args.required,
      version: 1,
      created_by_membership_id: ctx.membershipId,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/onboarding");
  return { data: row as OnboardingDocument, error: null };
}

/** Publishing an update bumps the version, so everyone must re-accept. */
export async function updateOnboardingDocument(
  id: string,
  args: { title?: string; body?: string; required?: boolean; bumpVersion?: boolean },
) {
  const ctx = await requireDocumentManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("onboarding_documents")
    .select("version")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (existingErr) return { data: null, error: existingErr.message };
  if (!existing) return { data: null, error: "Document not found." };

  const { data: row, error } = await supabase
    .from("onboarding_documents")
    .update({
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(args.required !== undefined ? { required: args.required } : {}),
      ...(args.bumpVersion ? { version: existing.version + 1 } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/onboarding");
  return { data: row as OnboardingDocument, error: null };
}

export async function acceptOnboardingDocument(documentId: string, version: number) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("staff_acceptances")
    .insert({
      tenant_id: ctx.tenantId,
      membership_id: ctx.membershipId,
      document_id: documentId,
      document_version: version,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/onboarding");
  return { data: row as StaffAcceptance, error: null };
}
