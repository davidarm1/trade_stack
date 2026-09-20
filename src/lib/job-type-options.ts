/** Matches the public.job_type enum exactly — keep in sync with the database. */
export const JOB_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "emergency", label: "Emergency" },
  { value: "maintenance", label: "Maintenance" },
  { value: "survey", label: "Survey" },
  { value: "sub_job", label: "Sub-job" },
] as const;

export type JobTypeValue = (typeof JOB_TYPE_OPTIONS)[number]["value"];

export const DEFAULT_JOB_TYPE: JobTypeValue = "standard";

const VALID_JOB_TYPES = new Set<string>(JOB_TYPE_OPTIONS.map((o) => o.value));

export function isValidJobType(value: unknown): value is JobTypeValue {
  return typeof value === "string" && VALID_JOB_TYPES.has(value);
}
