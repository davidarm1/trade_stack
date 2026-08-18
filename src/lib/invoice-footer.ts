import type { TemplateValues } from "@/lib/text-template";
import { renderTemplateText } from "@/lib/text-template";
import { paymentTermsLabel, paymentTermsSentence } from "@/lib/payment-terms";

const LEGACY_STATIC_PAYMENT_SENTENCE =
  /Payment due within \d+\s*days? of invoice date\./i;

function injectPaymentDaysTokens(template: string): string {
  return template
    .replace(/\[paymentdays\]/gi, "##payment_terms_sentence##")
    .replace(/\[paymentdays_sentence\]/gi, "##payment_terms_sentence##")
    .replace(/\[paymentdays_days\]/gi, "##payment_terms_days##")
    .replace(/\[paymentdays_label\]/gi, "##payment_terms_label##");
}

export function resolveInvoiceFooterText(args: {
  template: string | null | undefined;
  values: TemplateValues;
  paymentTermsDays: number | null | undefined;
}): string {
  const paymentTerms = args.paymentTermsDays == null ? Number.NaN : Number(args.paymentTermsDays);
  const paymentTermsSentenceText = paymentTermsSentence(paymentTerms);
  const template = String(args.template ?? "").trim();
  if (!template) {
    return paymentTermsSentenceText;
  }

  const normalizedTemplate = injectPaymentDaysTokens(template);
  const replacedLegacyTemplate = normalizedTemplate.replace(
    LEGACY_STATIC_PAYMENT_SENTENCE,
    paymentTermsSentenceText,
  );
  if (LEGACY_STATIC_PAYMENT_SENTENCE.test(normalizedTemplate)) {
    return replacedLegacyTemplate.trim() || paymentTermsSentenceText;
  }

  const rendered = renderTemplateText(replacedLegacyTemplate, {
    ...args.values,
    payment_terms_days: Number.isFinite(paymentTerms) ? paymentTerms : null,
    payment_terms_label: paymentTermsLabel(paymentTerms),
    payment_terms_sentence: paymentTermsSentenceText,
  }).trim();

  return rendered || paymentTermsSentenceText;
}
