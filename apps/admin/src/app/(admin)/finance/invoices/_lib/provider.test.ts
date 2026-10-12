import { describe, expect, it } from "vitest";
import { invoiceProviderLabels, mapInvoices } from "./types";

const t = ((key: string) => key) as unknown as Parameters<
  typeof invoiceProviderLabels
>[0];

/**
 * Faturayı kesen sağlayıcı listede rozet olarak görünür: iptal/iade ve PDF
 * belgeyi kesen entegratörde yapılır, iki sağlayıcı birlikte yaşarken operatör
 * belgeyi hangi portalda arayacağını satırdan okur.
 */
describe("invoice provider", () => {
  it("API'nin döndürdüğü sağlayıcıyı satıra taşır", () => {
    const [row] = mapInvoices([{ id: "inv-1", provider: "netsis" }]);

    expect(row.provider).toBe("netsis");
  });

  it("alanı döndürmeyen eski bir API'de belge eLogo sayılır", () => {
    const [row] = mapInvoices([{ id: "inv-1" }]);

    expect(row.provider).toBe("elogo");
  });

  it("her sağlayıcının etiketi katalogdan gelir", () => {
    expect(invoiceProviderLabels(t)).toEqual({
      elogo: "admin.finance.invoices.providerName.elogo",
      netsis: "admin.finance.invoices.providerName.netsis",
    });
  });
});
