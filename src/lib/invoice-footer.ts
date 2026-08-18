import type { TemplateValues } from "@/lib/text-template";
import { renderTemplateText } from "@/lib/text-template";
import { paymentTermsLabel, paymentTermsSentence } from "@/lib/payment-terms";

const LEGACY_STATIC_PAYMENT_FOOTER =
  /^Payment due within .*? of invoice date\. Late payments may incur interest and recovery costs in line with the Late Payment of Commercial Debts \(Interest\) Act 1998\.?$/i;

export function resolveInvoiceFooterText(args: {
  template: string | null | undefined;
  values: TemplateValues;
  paymentTermsDays: number | null | undefined;
}): string {
  const paymentTerms = args.paymentTermsDays == null ? Number.NaN : Number(args.paymentTermsDays);
  const paymentTermsSentenceText = paymentTermsSentence(paymentTerms);
  const template = String(args.template ?? "").trim();
  if (!template || LEGACY_STATIC_PAYMENT_FOOTER.test(template)) {
    return paymentTermsSentenceText || template;
  }

  const rendered = renderTemplateText(template, {
    ...args.values,
    payment_terms_days: Number.isFinite(paymentTerms) ? paymentTerms : null,
    payment_terms_label: paymentTermsLabel(paymentTerms),
    payment_terms_sentence: paymentTermsSentenceText,
  }).trim();

  return rendered || paymentTermsSentenceText;
}
