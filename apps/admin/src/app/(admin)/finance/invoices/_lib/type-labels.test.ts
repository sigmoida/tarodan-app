import { describe, expect, it } from "vitest";
import { invoiceTypeLabels, typeFilterOptions } from "./types";

/**
 * The installment fee (vade farkı) document (ADR 0019 D4) is listed,
 * filtered and labelled like every other buyer document; the label comes
 * from the catalog, the API sends the raw type.
 */
describe("installment fee document type", () => {
  const t = ((key: string) => key) as Parameters<typeof invoiceTypeLabels>[0];

  it("has a filter option next to the other buyer documents", () => {
    const values = typeFilterOptions(t).map((option) => option.value);

    expect(values).toContain("buyer_installment_fee");
    expect(values.indexOf("buyer_installment_fee")).toBe(
      values.indexOf("buyer_shipping") + 1,
    );
  });

  it("is labelled from the catalog", () => {
    expect(invoiceTypeLabels(t).buyer_installment_fee).toBe(
      "admin.finance.invoices.types.buyerInstallmentFee",
    );
  });
});
