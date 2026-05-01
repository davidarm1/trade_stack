/** Draft job + optional new-client fields returned from AI message parsing. */
export type JobAiPrefill = {
  title?: string;
  description?: string;
  date_onsite?: string | null;
  site_address1?: string;
  site_address2?: string;
  site_town?: string;
  site_postcode?: string;
  labour_charge?: number | null;
  payment_terms_days?: number | null;
  custom_po_number?: string;
  legacy_ref?: string;
  new_company_name?: string;
  new_contact_name?: string;
  new_contact_email?: string;
  new_contact_number?: string;
  new_address1?: string;
  new_address2?: string;
  new_town?: string;
  new_postcode?: string;
  new_site_address1?: string;
  new_site_address2?: string;
  new_site_town?: string;
  new_site_postcode?: string;
  new_payment_terms_days?: number | null;
  new_notes?: string;
  /** Matched to team list on the client when applying the form. */
  assigned_engineer_name?: string | null;
};
