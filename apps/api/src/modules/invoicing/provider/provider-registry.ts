import { Injectable } from "@nestjs/common";
import type { EInvoiceProviderName } from "@prisma/client";
import type { EInvoiceProvider } from "./e-invoice-provider";
import { ElogoInvoiceProvider } from "./elogo.provider";
import { NetsisInvoiceProvider } from "./netsis.provider";

/**
 * Sağlayıcıları ADLA çözen kayıt.
 *
 * İki ayrı soru vardır ve iki ayrı cevabı:
 *  - "Yeni belgeyi kim keser?" → `INVOICE_PROVIDER` (`E_INVOICE_PROVIDER`
 *    bağlaması, modülde bu kayıttan seçilir).
 *  - "Bu KAYDIN durumunu kim bilir, onu kim iptal eder, PDF'ini kim verir?"
 *    → kaydın kendi `FiscalInvoice.provider` kolonu. Sağlayıcı değişse de
 *    eski belge eski sağlayıcıda yaşar; Netsis'e geçtikten sonra bir eLogo
 *    belgesinin iptali yine eLogo'ya gitmek zorunda.
 */
@Injectable()
export class InvoiceProviderRegistry {
  private readonly providers: Record<EInvoiceProviderName, EInvoiceProvider>;

  constructor(elogo: ElogoInvoiceProvider, netsis: NetsisInvoiceProvider) {
    this.providers = { elogo, netsis };
  }

  get(name: EInvoiceProviderName): EInvoiceProvider {
    return this.providers[name];
  }
}

/**
 * Kesilmiş bir kaydın sağlayıcısı. Kayıt yoksa ya da kolon okunmadıysa
 * bağlı (varsayılan) sağlayıcı — kayıt aracı olmayan birim testlerinde de.
 */
export function providerForRecord(
  registry: Pick<InvoiceProviderRegistry, "get"> | undefined,
  bound: EInvoiceProvider,
  name: EInvoiceProviderName | null | undefined,
): EInvoiceProvider {
  if (!registry || !name || name === bound.name) return bound;
  return registry.get(name);
}
