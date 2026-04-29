/** In-app display, e.g. list and headings — `#183` */
export function formatJobRef(jobNumber: number | null | undefined): string {
  if (jobNumber == null || Number.isNaN(Number(jobNumber))) return "—";
  return `#${Number(jobNumber)}`;
}

/** Formal reference for emails / PDFs — `JOB-183` */
export function formatJobRefFormal(jobNumber: number | null | undefined): string {
  if (jobNumber == null || Number.isNaN(Number(jobNumber))) return "";
  return `JOB-${Number(jobNumber)}`;
}

/** Suggested subject when emailing about an invoice for this job */
export function jobInvoiceEmailSubject(args: {
  jobNumber: number | null | undefined;
  title: string;
}): string {
  const formal = formatJobRefFormal(args.jobNumber);
  const prefix = formal || "Job";
  const t = args.title.trim() || "Invoice";
  return `${prefix}: ${t}`;
}

export function jobMatchesSearch(
  job: {
    id: string;
    title?: string | null;
    description?: string | null;
    legacy_ref?: string | null;
    job_number?: number | null;
    custom_po_number?: string | null;
  },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const hay = (s: string | null | undefined) => (s ?? "").toLowerCase();
  if (hay(job.title).includes(q)) return true;
  if (hay(job.description).includes(q)) return true;
  if (hay(job.legacy_ref).includes(q)) return true;
  if (hay(job.custom_po_number).includes(q)) return true;
  if (job.job_number != null && String(job.job_number).includes(q)) return true;
  if (job.id.toLowerCase().includes(q)) return true;
  const compactId = job.id.replace(/-/g, "").toLowerCase();
  const compactQ = q.replace(/-/g, "");
  if (compactQ.length >= 6 && compactId.includes(compactQ)) return true;
  return false;
}
