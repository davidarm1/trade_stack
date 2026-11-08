import { describe, expect, it } from "vitest";
import { parseInvoiceRecipients } from "./invoice-recipients";

describe("parseInvoiceRecipients", () => {
  it("splits, lowercases and de-duplicates", () => {
    expect(parseInvoiceRecipients("A@x.com, a@x.com;b@y.co.uk\nc@z.org")).toEqual({
      recipients: ["a@x.com", "b@y.co.uk", "c@z.org"],
      error: null,
    });
  });

  it("rejects empty input and bad addresses", () => {
    expect(parseInvoiceRecipients("  ").error).toMatch(/at least one/i);
    expect(parseInvoiceRecipients(null).error).toMatch(/at least one/i);
    expect(parseInvoiceRecipients("ok@x.com, nope").error).toBe("Invalid email address: nope");
  });
});
