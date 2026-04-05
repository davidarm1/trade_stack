export type UserRole = "owner" | "office" | "engineer" | "viewer";

export type WorkContractType =
  | "employed"
  | "subcontractor"
  | "part_time";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  vat_number: string | null;
  company_reg_number: string | null;
  address1: string | null;
  address2: string | null;
  town: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  default_vat_rate: number | null;
  default_payment_terms_days: number | null;
  currency: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  work_contract_type: WorkContractType | null;
  charge_rate: number | null;
  hourly_rate: number | null;
  company_phone: string | null;
  approver1_id: string | null;
  approver2_id: string | null;
  is_active: boolean;
  leaver_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  company_name: string;
  address1: string | null;
  address2: string | null;
  town: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_number: string | null;
  site_address1: string | null;
  site_address2: string | null;
  site_town: string | null;
  site_postcode: string | null;
  payment_terms_days: number | null;
  default_vat_exempt: boolean | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Job {
  id: string;
  tenant_id: string;
  client_id: string | null;
  job_type: string | null;
  status: string | null;
  title: string | null;
  description: string | null;
  assigned_engineer_id: string | null;
  allocated_at: string | null;
  site_address1: string | null;
  site_address2: string | null;
  site_town: string | null;
  site_postcode: string | null;
  date_onsite: string | null;
  time_onsite: string | null;
  labour_charge: number | null;
  total_materials: number | null;
  subtotal: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  total_inc_vat: number | null;
  remove_vat: boolean | null;
  payment_terms_days: number | null;
  client_order_number: string | null;
  custom_invoice_number: string | null;
  custom_po_number: string | null;
  invoice_source: string | null;
  sent_to_engineer_at: string | null;
  received_from_engineer_at: string | null;
  approved_at: string | null;
  approved_by_id: string | null;
  invoice_sent_at: string | null;
  invoice_sent_to_email: string | null;
  invoice_paid_at: string | null;
  payment_status: string | null;
  sent_to_debt_collection_at: string | null;
  overdue_comment: string | null;
  notes: string | null;
  parent_job_id: string | null;
  source_quote_id: string | null;
  new_work_request: boolean | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface JobMaterial {
  id: string;
  tenant_id: string;
  job_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  sort_order: number | null;
  created_at: string;
}

export interface JobCompletion {
  id: string;
  tenant_id: string;
  job_id: string;
  engineer_id: string | null;
  work_carried_out: string | null;
  parts_used: string | null;
  date_completed: string | null;
  start_time: string | null;
  finish_time: string | null;
  client_print_name: string | null;
  client_signature_url: string | null;
  submitted_at: string | null;
}

export interface JobImage {
  id: string;
  tenant_id: string;
  job_id: string;
  image_url: string;
  image_name: string | null;
  image_type: string | null;
  uploaded_by_id: string | null;
  uploaded_at: string | null;
}

export interface Quote {
  id: string;
  tenant_id: string;
  client_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  address1: string | null;
  address2: string | null;
  town: string | null;
  postcode: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  status: string | null;
  booked_job_id: string | null;
  assigned_engineer_id: string | null;
  quote_date: string | null;
  expires_at: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Receipt {
  id: string;
  tenant_id: string;
  uploaded_by_id: string | null;
  parent_receipt_id: string | null;
  receipt_url: string | null;
  friendly_receipt_url: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  supplier_name: string | null;
  supplier_reference: string | null;
  amount_net: number | null;
  amount_tax: number | null;
  amount_total: number | null;
  currency: string | null;
  payment_status: string | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  is_recurring: boolean | null;
  recurring_frequency: string | null;
  recurring_start_date: string | null;
  recurring_end_date: string | null;
  recurring_day_of_month: number | null;
  category: string | null;
  subcategory: string | null;
  account_code: string | null;
  tax_deductible: boolean | null;
  notes: string | null;
  processed_by_ai: boolean | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Timesheet {
  id: string;
  tenant_id: string;
  user_id: string | null;
  job_id: string | null;
  shift_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  status: string | null;
  comments: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Wage {
  id: string;
  tenant_id: string;
  user_id: string | null;
  period_date: string | null;
  hourly_rate: number | null;
  base_hours: number | null;
  overtime_hours: number | null;
  overtime_rate: number | null;
  base_wage: number | null;
  overtime_wage: number | null;
  total_wage: number | null;
  approval_status: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingRow {
  id: string;
  tenant_id: string;
  field_key: string;
  field_value: string | null;
  created_at: string;
  updated_at: string;
}
