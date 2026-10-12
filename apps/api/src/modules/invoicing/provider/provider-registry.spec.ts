import type { EInvoiceProvider } from "./e-invoice-provider";
import type { ElogoInvoiceProvider } from "./elogo.provider";
import type { NetsisInvoiceProvider } from "./netsis.provider";
import { InvoiceProviderRegistry, providerForRecord } from "./provider-registry";

const fake = (name: "elogo" | "netsis") =>
  ({ name, numbering: name === "elogo" ? "local" : "provider" }) as
    EInvoiceProvider;

describe("InvoiceProviderRegistry", () => {
  const elogo = fake("elogo");
  const netsis = fake("netsis");
  const registry = new InvoiceProviderRegistry(
    elogo as ElogoInvoiceProvider,
    netsis as NetsisInvoiceProvider,
  );

  it("her sağlayıcıyı adıyla çözer", () => {
    expect(registry.get("elogo")).toBe(elogo);
    expect(registry.get("netsis")).toBe(netsis);
  });

  describe("providerForRecord", () => {
    it("kaydı kesen sağlayıcıyı döndürür — bağlı sağlayıcı farklı olsa da", () => {
      // Netsis'e geçildi; eski eLogo belgesinin işlemleri eLogo'da kalır.
      expect(providerForRecord(registry, netsis, "elogo")).toBe(elogo);
      expect(providerForRecord(registry, elogo, "netsis")).toBe(netsis);
    });

    it("kaydın sağlayıcısı bağlı olanla aynıysa bağlı olan", () => {
      expect(providerForRecord(registry, elogo, "elogo")).toBe(elogo);
    });

    it("kolon okunmadıysa ya da kayıt aracı yoksa bağlı sağlayıcı", () => {
      expect(providerForRecord(registry, netsis, undefined)).toBe(netsis);
      expect(providerForRecord(registry, netsis, null)).toBe(netsis);
      expect(providerForRecord(undefined, netsis, "elogo")).toBe(netsis);
    });
  });
});
