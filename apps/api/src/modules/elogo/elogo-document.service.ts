import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type ElogoInvoiceType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { ElogoService } from "./elogo.service";
import { type GuestInvoiceRecipient } from "./invoice/elogo-guest-recipient";
import type { ElogoDocumentType } from "./helpers/elogo.types";
import { TaxService } from "../tax/tax.service";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { type UblParty } from "./ubl/ubl-invoice.builder";
import { invoiceAmountsFor } from "./invoice/invoice-amounts";
import { invoiceIssueDate, invoiceIssueTime } from "./invoice/invoice-datetime";
import { VAT_SOURCE_BY_TYPE } from "./invoice/invoice-vat-rate";
import { formatElogoInvoiceNumber } from "./invoice/elogo-document-number";

/**
 * Faturanın GÖVDESİNİ kuran katman — ElogoInvoicingService'ten birebir taşındı.
 * Tek soruyu cevaplar: "bu belge kime, hangi tutarla, hangi KDV oranıyla ve
 * hangi numarayla kesilecek?" Belgeyi kesmez, göndermez, tersine çevirmez.
 *
 * KDV oranının kaynağını faturanın TÜRÜ belirler (`invoice-vat-rate.ts`) ve
 * hizmet KDV'si checkout'un okuduğu ayarın AYNISINDAN gelir — fatura ayrı bir
 * kaynaktan okusaydı tahsilat ile beyan sessizce ayrışırdı. Numara tahsisi de
 * burada: tx içi ve tx dışı iki yol da aynı sayaçtan ilerler.
 */
@Injectable()
export class ElogoDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly config: ConfigService,
    @Optional() private readonly taxService?: TaxService,
    /**
     * Hizmet KDV'sinin TEK kaynağı — checkout tahsilatı da bunu okur.
     */
    @Optional() private readonly taxPolicy?: OrderTaxPolicyService,
  ) {}

  // ───────────────────────── config ─────────────────────────
  private cfg(key: string, def = ""): string {
    return (this.config.get<string>(key) ?? def).trim();
  }
  private get vatRate(): number {
    return Number(this.cfg("ELOGO_VAT_RATE", "20")) || 20;
  }
  /**
   * Kesim anındaki KDV oranı. Kaynağı faturanın TÜRÜ belirler — bkz.
   * `invoice-vat-rate.ts`:
   *
   *  - hizmet bedelleri → checkout'un okuduğu `service_vat_rate` ayarı (kapalıysa 0)
   *  - platform ürün satışı → ürünün KATEGORİ oranı
   *  - diğerleri → bölgenin varsayılan oranı, yoksa `ELOGO_VAT_RATE`
   *
   * Kayıt snapshot'ı (`ElogoInvoice.vatRate`) sonraki retry/iade adımlarında aynen
   * kullanılır; oran sonradan değişse bile kesilmiş belge etkilenmez.
   */
  async resolveVatRate(
    type: ElogoInvoiceType,
    categoryId?: string | null,
  ): Promise<number> {
    const source = VAT_SOURCE_BY_TYPE[type] ?? "standard";

    if (source === "service" && this.taxPolicy) {
      try {
        const policy = await this.taxPolicy.resolve();
        // KDV kapalıysa oran 0'dır; env'e DÜŞÜLMEZ, aksi halde tahsil edilmeyen
        // bir KDV faturaya yazılırdı.
        return this.taxPolicy.effectiveServiceVatRate(policy);
      } catch {
        // ayar okunamadı — aşağıdaki genel çözüme düş
      }
    }

    try {
      const resolved = await this.taxService?.resolveTaxRate(
        "TR",
        null,
        source === "category" ? (categoryId ?? null) : null,
      );
      if (resolved && resolved.rate > 0) return resolved.rate;
    } catch {
      // config çözülemedi — env fallback
    }
    return this.vatRate;
  }
  private get prefix(): string {
    return this.cfg("ELOGO_INVOICE_PREFIX", "TRD");
  }
  get xsltUuid(): string | undefined {
    return this.cfg("ELOGO_INVOICE_XSLT_UUID") || undefined;
  }
  supplierParty(): UblParty {
    return {
      vknTckn: this.cfg("ELOGO_COMPANY_VKN", this.cfg("ELOGO_WS_USERNAME", "")),
      title: this.cfg("ELOGO_COMPANY_TITLE", "TARODAN"),
      taxOffice: this.cfg("ELOGO_COMPANY_TAXOFFICE") || undefined,
      city: this.cfg("ELOGO_COMPANY_CITY") || undefined,
      district: this.cfg("ELOGO_COMPANY_DISTRICT") || undefined,
      streetAddress: this.cfg("ELOGO_COMPANY_ADDRESS") || undefined,
      email: this.cfg("ELOGO_COMPANY_EMAIL") || undefined,
    };
  }

  // ───────────────────────── helpers ─────────────────────────
  round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  /**
   * Tutarın KDV yönü faturanın TÜRÜNDEN gelir, ortamdan değil — komisyon/hizmet
   * bedeli matrahtır (KDV eklenir), tüketici fiyatları brüttür (KDV ayrıştırılır).
   * Kural ve gerekçesi: `invoice-amounts.ts`.
   */
  invoiceAmounts(
    type: ElogoInvoiceType,
    amount: number,
    vatRate: number,
  ): { net: number; tax: number; total: number } {
    return invoiceAmountsFor(type, amount, vatRate);
  }
  /**
   * Belge tarihi/saati/numara yılı TEK takvimden okunur (Türkiye) — bkz.
   * `invoice-datetime.ts`. Süreç saat diliminden bağımsızdır.
   */
  ymd(d: Date): string {
    return invoiceIssueDate(d);
  }
  hms(d: Date): string {
    return invoiceIssueTime(d);
  }

  /** Gap-free belge numarası: PREFIX + yıl + 9 hane (ElogoDocSequence atomik artırım). */
  async allocateInvoiceNumber(year: number): Promise<string> {
    return this.prisma.$transaction((tx) =>
      this.allocateInvoiceNumberInTransaction(tx, year),
    );
  }

  async allocateInvoiceNumberInTransaction(
    tx: Prisma.TransactionClient,
    year: number,
  ): Promise<string> {
    const prefix = this.prefix;
    const row = await tx.elogoDocSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatElogoInvoiceNumber(prefix, year, row.lastValue);
  }

  /** Alıcı (User) → UBL party + belge tipi (e-Fatura mükellefse EINVOICE). */
  async resolveRecipient(
    userId: string,
    /**
     * Misafir siparişinin gerçek alıcı bilgisi. Tüm misafir checkout'ları tek
     * sistem kullanıcısını paylaştığı için kullanıcı kaydından okumak faturayı
     * "GUEST_SYSTEM" adına ve sistem e-postasına kesiyordu — nihai tüketici yolu
     * bile gerçek adı gerektirir ve müşteri zorunlu e-Arşiv kopyasını almıyordu.
     */
    guestOverride?: GuestInvoiceRecipient | null,
  ): Promise<{
    vknTckn: string;
    name: string;
    email?: string | null;
    address?: GuestInvoiceRecipient["address"];
    party: UblParty;
    documentType: ElogoDocumentType;
    alias?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        companyName: true,
        taxId: true,
        email: true,
      },
    });
    const digits = (user?.taxId || "").replace(/\D/g, "");
    const hasRealTaxId = digits.length === 10 || digits.length === 11;
    const vknTckn = hasRealTaxId ? digits : "11111111111"; // bilinmeyen nihai tüketici (GİB)
    const name =
      guestOverride?.name ||
      user?.companyName ||
      user?.displayName ||
      "Müşteri";
    const email = guestOverride?.email ?? user?.email;

    let documentType: ElogoDocumentType = "EARCHIVE";
    let alias: string | undefined;
    if (hasRealTaxId) {
      const chk = await this.elogo.checkUser(vknTckn).catch(() => null);
      if (chk?.isEInvoiceUser) {
        documentType = "EINVOICE";
        alias = chk.eInvoicePkAlias;
      }
    }
    return {
      vknTckn,
      name,
      email,
      address: guestOverride?.address,
      party: this.buildParty(
        vknTckn,
        name,
        email,
        guestOverride?.address
          ? {
              city: guestOverride.address.city,
              district: guestOverride.address.district,
              address: guestOverride.address.street,
            }
          : null,
      ),
      documentType,
      alias,
    };
  }

  buildParty(
    vknTckn: string,
    name: string,
    email?: string | null,
    addr?: {
      city?: string | null;
      district?: string | null;
      address?: string | null;
    } | null,
  ): UblParty {
    // GİB UBL-TR: PostalAddress'te CitySubdivisionName + CityName gerekli (yalnız Country → şema hatası).
    const common = {
      vknTckn,
      email: email || undefined,
      city: addr?.city || "Belirtilmemiş",
      district: addr?.district || "Belirtilmemiş",
      streetAddress: addr?.address || undefined,
    };
    if (vknTckn.length === 10) {
      return { ...common, title: name };
    }
    // GİB gerçek kişi: cac:Person/cbc:FirstName VE cbc:FamilyName ikisi de zorunlu.
    // Biri boş kalırsa eLogo "ad-soyad bulunmalıdır" ile reddeder; bu yüzden asla boş bırakma.
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const lastName = parts.pop()!;
      return { ...common, firstName: parts.join(" "), lastName };
    }
    const single = parts[0];
    return single
      ? { ...common, firstName: single, lastName: single }
      : { ...common, firstName: "Nihai", lastName: "Tüketici" };
  }

  /** Alıcının varsayılan adresini çek (UBL PostalAddress için). */
  async fetchAddress(userId?: string | null): Promise<{
    city: string | null;
    district: string | null;
    address: string | null;
  } | null> {
    if (!userId) return null;
    return this.prisma.address
      .findFirst({
        where: { userId },
        orderBy: { isDefault: "desc" },
        select: { city: true, district: true, address: true },
      })
      .catch(() => null);
  }
}
