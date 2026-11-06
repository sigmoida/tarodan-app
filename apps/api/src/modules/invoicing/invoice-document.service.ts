import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  RefundAttemptStatus,
  type FiscalInvoiceType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { type GuestInvoiceRecipient } from "./invoice/guest-recipient";
import { TaxService } from "../tax/tax.service";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import {
  E_INVOICE_PROVIDER,
  type EInvoiceProvider,
  type EInvoiceScenario,
  type FiscalParty,
} from "./provider/e-invoice-provider";
import { invoiceAmountsFor } from "./invoice/invoice-amounts";
import {
  buildPackageFeeDocuments,
  hasCompleteComponentBreakdown,
  readFeeDiscounts,
  type PackageFeeDocument,
  type PackageFeeOrderRow,
} from "./invoice/package-fee-basis";
import { invoiceIssueDate, invoiceIssueTime } from "./invoice/invoice-datetime";
import { VAT_SOURCE_BY_TYPE } from "./invoice/invoice-vat-rate";
import { formatInvoiceNumber } from "./invoice/document-number";
import { DEFAULT_ELOGO_INVOICE_PREFIX } from "../../config/elogo";
import {
  orderInstallmentFeeOf,
  refundInstallmentFeeOf,
} from "../payment/helpers/charged-amount";
import type { InstallmentFeeOrderRow } from "./invoice/installment-fee-basis";

/** What the installment fee document of a package is built from. */
export interface InstallmentFeeBasis {
  buyerId: string;
  /** Koli kodu — the document's "Kayıt No" is derived from it. */
  packageNumber: string;
  shippingAddress: unknown;
  orders: InstallmentFeeOrderRow[];
  paymentFeeFullyRefunded: boolean;
  /**
   * The VAT rate inside the fee, from the payment's captured charge attempt
   * (`PaymentChargeAttempt.feeVatRatePct`); null when no captured attempt
   * carries the fee, which the issuer refuses (fail closed).
   */
  vatRatePct: number | null;
  /**
   * Every package of the payment, filled only once the payment's whole fee
   * went back: the refund that closes the payment can carry another
   * package's shortfall, so the reversal visits them all.
   */
  paymentPackageIds: string[];
}

/**
 * Faturanın GÖVDESİNİ kuran katman — InvoicingService'ten birebir taşındı.
 * Tek soruyu cevaplar: "bu belge kime, hangi tutarla, hangi KDV oranıyla ve
 * hangi numarayla kesilecek?" Belgeyi kesmez, göndermez, tersine çevirmez.
 *
 * KDV oranının kaynağını faturanın TÜRÜ belirler (`invoice-vat-rate.ts`) ve
 * hizmet KDV'si checkout'un okuduğu ayarın AYNISINDAN gelir — fatura ayrı bir
 * kaynaktan okusaydı tahsilat ile beyan sessizce ayrışırdı. Numara tahsisi de
 * burada: tx içi ve tx dışı iki yol da aynı sayaçtan ilerler.
 */
@Injectable()
export class InvoiceDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(E_INVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
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
   * Kayıt snapshot'ı (`FiscalInvoice.vatRate`) sonraki retry/iade adımlarında aynen
   * kullanılır; oran sonradan değişse bile kesilmiş belge etkilenmez.
   */
  async resolveVatRate(
    type: FiscalInvoiceType,
    categoryId?: string | null,
  ): Promise<number> {
    const source = VAT_SOURCE_BY_TYPE[type] ?? "standard";

    // Fail closed: a rate fixed at charge time must come from that charge's
    // snapshot; a resolved "today" rate could disagree with the VAT the
    // buyer paid.
    if (source === "charge_snapshot") {
      throw new Error(
        `VAT rate of ${type} is snapshotted on the charge; pass it in instead of resolving it`,
      );
    }

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
  /**
   * The VAT rate a document is CUT with. A `charge_snapshot` type takes the
   * rate frozen on its charge (`snapshotVatRate`) and refuses to be cut
   * without it; every other type resolves its own rate and refuses a passed
   * one, so a snapshot can never override a category or service rate.
   */
  async resolveCutVatRate(
    type: FiscalInvoiceType,
    opts: { categoryId?: string | null; snapshotVatRate?: number } = {},
  ): Promise<number> {
    const { snapshotVatRate } = opts;
    if (VAT_SOURCE_BY_TYPE[type] === "charge_snapshot") {
      if (
        snapshotVatRate === undefined ||
        !Number.isFinite(snapshotVatRate) ||
        snapshotVatRate < 0
      ) {
        throw new Error(
          `VAT rate of ${type} is snapshotted on the charge and was not passed`,
        );
      }
      return snapshotVatRate;
    }
    if (snapshotVatRate !== undefined) {
      throw new Error(
        `${type} resolves its own VAT rate; a charge snapshot rate is not accepted`,
      );
    }
    return this.resolveVatRate(type, opts.categoryId);
  }

  private get prefix(): string {
    return this.cfg("ELOGO_INVOICE_PREFIX", DEFAULT_ELOGO_INVOICE_PREFIX);
  }
  supplierParty(): FiscalParty {
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
    type: FiscalInvoiceType,
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

  /**
   * Kesim anındaki numara kapısı. Numarayı sağlayıcı veriyorsa
   * (`numbering === "provider"`) kayıt numarasız açılır ve sayaç İLERLEMEZ —
   * aksi halde boşluksuz seride hiç kullanılmayan numaralar kalırdı. Yerel
   * numaralandırmada aynı transaction'da boşluksuz TRD numarası tahsis edilir.
   */
  async allocateDocumentNumberInTransaction(
    tx: Prisma.TransactionClient,
    year: number,
  ): Promise<string | null> {
    if (this.provider.numbering !== "local") return null;
    return this.allocateInvoiceNumberInTransaction(tx, year);
  }

  /** Gap-free belge numarası: PREFIX + yıl + 9 hane (FiscalDocSequence atomik artırım). */
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
    const row = await tx.fiscalDocSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return formatInvoiceNumber(prefix, year, row.lastValue);
  }

  /** Alıcı (User) → belge tarafı + belge tipi (e-Fatura mükellefse EINVOICE). */
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
    party: FiscalParty;
    documentType: EInvoiceScenario;
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

    let documentType: EInvoiceScenario = "EARCHIVE";
    let alias: string | undefined;
    if (hasRealTaxId) {
      const chk = await this.provider
        .resolveRecipientKind(vknTckn)
        .catch(() => null);
      if (chk?.kind === "EINVOICE") {
        documentType = "EINVOICE";
        alias = chk.alias;
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
  ): FiscalParty {
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

  /** Alıcının varsayılan adresini çek (belgedeki alıcı adresi için). */
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

  /**
   * Alıcıya GERİ VERİLMİŞ gidiş kargosu — PAKET toplamı.
   *
   * Kargo payının kesinti defterinde kümülatif iade sütunu yoktur (ücretler
   * gibi), bu yüzden iade bileşenlerinden toplanır. Yalnız parası GERÇEKTEN
   * iade edilmiş talepler sayılır: politikası kesinleşmiş ama ödemesi dönmemiş
   * bir talebi düşmek faturayı tahsilatın altına indirirdi.
   *
   * Toplam SİPARİŞ BAZINDA dağıtılmaz: grup checkout kargo payını satıcının
   * yalnız İLK siparişine yazar, gidiş kargosunu iade eden talep ise paketi
   * KAPATAN (çoğu kez kardeş) siparişe düşer. İadeyi doğduğu siparişte düşmek
   * onu yok ediyordu (0 − iade = 0) ve kargo tamamen geri verildikten sonra da
   * belge tam matrahla kesiliyordu.
   */
  private async refundedBuyerShippingForOrders(
    orderIds: string[],
  ): Promise<number> {
    try {
      const rows = await this.prisma.refundFinancialComponent.findMany({
        where: {
          componentCode: "outbound_shipping",
          treatment: "buyer_refund",
          refundRequest: {
            orderId: { in: orderIds },
            refundedAt: { not: null },
          },
        },
        select: { netAmount: true },
      });
      return rows.reduce((sum, row) => sum + Number(row.netAmount), 0);
    } catch {
      // İade bileşenleri okunamadı — kargo matrahı iade DÜŞÜLMEDEN kesilir ve
      // fazlası iade faturasıyla dengelenir; belgeyi hiç kesmemek daha kötüdür.
      return 0;
    }
  }

  /**
   * Paketin HİZMET BAŞINA belge matrahları — kalem bazlı kesimin TEK kaynağı.
   *
   * Kesim (`InvoiceIssuingService`), iade öncesi yeniden fiyatlama ve iade faturası
   * oranı aynı bu metodu okur; hiçbiri kendi toplamasını yapmaz. `documents`
   * yalnız matrahı SIFIR OLMAYAN kalemleri taşır — bedeli doğmamış hizmet için
   * belge kesilmez.
   *
   * `componentBreakdownComplete` false ise paketin defterlerinde kalem kırılımı
   * yoktur (v2 öncesi kayıt): kalem bazlı belge üretilemez, çağıran LEGACY
   * birleşik belgeye düşer.
   */
  async resolvePackageFeeBasis(packageId: string): Promise<{
    sellerId: string;
    buyerId: string;
    /** Koli kodu — belgeye "Sipariş No" olarak basılır. */
    packageNumber: string;
    componentBreakdownComplete: boolean;
    shippingAddress: unknown;
    documents: PackageFeeDocument[];
  } | null> {
    const pkg = await this.prisma.orderPackage
      .findUnique({
        where: { id: packageId },
        select: {
          sellerId: true,
          buyerId: true,
          packageNumber: true,
          orders: {
            select: {
              id: true,
              shippingAddress: true,
              buyerShippingAmount: true,
              sellerShippingAmount: true,
              feeDiscountBreakdown: true,
              commissionLedger: {
                select: {
                  componentBreakdownComplete: true,
                  buyerCommissionAmount: true,
                  buyerPlatformFeeAmount: true,
                  sellerCommissionAmount: true,
                  sellerPlatformFeeAmount: true,
                  refundedBuyerCommissionAmount: true,
                  refundedBuyerPlatformFeeAmount: true,
                  refundedSellerCommissionAmount: true,
                  refundedSellerPlatformFeeAmount: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
      .catch(() => null);
    if (!pkg || pkg.orders.length === 0) return null;

    // Alıcıya GERİ VERİLMİŞ gidiş kargosu: kargo payının kesinti defterinde
    // kümülatif iade sütunu yoktur, iade bileşenlerinden toplanır. Yalnız parası
    // gerçekten iade edilmiş talepler sayılır — politika kesinleşmiş ama ödeme
    // dönmemiş bir talebi düşmek faturayı tahsilatın altına indirirdi.
    //
    // Paket toplamı, kargo payını TAŞIYAN siparişe yazılır: iade kardeş
    // siparişten doğmuş olabilir ve orada düşülürse (matrahı 0) yok olurdu.
    const refundedBuyerShipping = await this.refundedBuyerShippingForOrders(
      pkg.orders.map((o) => o.id),
    );
    const shippingCarrierId =
      pkg.orders.find((o) => Number(o.buyerShippingAmount ?? 0) > 0)?.id ??
      null;

    const orders: PackageFeeOrderRow[] = pkg.orders.map((order) => ({
      id: order.id,
      buyerShippingAmount: Number(order.buyerShippingAmount ?? 0),
      sellerShippingAmount: Number(order.sellerShippingAmount ?? 0),
      refundedBuyerShippingAmount:
        order.id === shippingCarrierId ? refundedBuyerShipping : 0,
      feeDiscounts: readFeeDiscounts(order.feeDiscountBreakdown),
      ledger: order.commissionLedger
        ? {
            componentBreakdownComplete:
              order.commissionLedger.componentBreakdownComplete,
            buyerCommissionAmount: Number(
              order.commissionLedger.buyerCommissionAmount,
            ),
            buyerPlatformFeeAmount: Number(
              order.commissionLedger.buyerPlatformFeeAmount,
            ),
            sellerCommissionAmount: Number(
              order.commissionLedger.sellerCommissionAmount,
            ),
            sellerPlatformFeeAmount: Number(
              order.commissionLedger.sellerPlatformFeeAmount,
            ),
            refundedBuyerCommissionAmount: Number(
              order.commissionLedger.refundedBuyerCommissionAmount,
            ),
            refundedBuyerPlatformFeeAmount: Number(
              order.commissionLedger.refundedBuyerPlatformFeeAmount,
            ),
            refundedSellerCommissionAmount: Number(
              order.commissionLedger.refundedSellerCommissionAmount,
            ),
            refundedSellerPlatformFeeAmount: Number(
              order.commissionLedger.refundedSellerPlatformFeeAmount,
            ),
          }
        : null,
    }));

    // Oran TEK kez çözülür: altı kalem de aynı hizmet KDV'sine tabidir ve kalem
    // başına ayrı okumak, ayar kesim ortasında değişirse belgeleri ayrıştırırdı.
    const vatRate = await this.resolveVatRate("buyer_service_fee");

    return {
      sellerId: pkg.sellerId,
      buyerId: pkg.buyerId,
      packageNumber: pkg.packageNumber,
      componentBreakdownComplete: hasCompleteComponentBreakdown(orders),
      shippingAddress: pkg.orders[0].shippingAddress,
      documents: buildPackageFeeDocuments(orders, vatRate),
    };
  }

  /**
   * The installment fee (vade farkı) document's inputs for a package
   * (ADR 0019 D4): each order's fee share and the fee given back with its
   * finalized refunds, and the VAT rate of the captured charge attempt. The
   * issue, the reprice of an unsent document and the reversal all read it
   * here; the amounts are `buildInstallmentFeeDocument`.
   *
   * Null when no order of the package carries a fee (a single payment, a
   * 100 % platform share, installments off): one query, no document.
   * Read errors are NOT swallowed: "no fee" would drop a document, or a
   * reversal, silently; the caller's retry picks it up.
   */
  async resolveInstallmentFeeBasis(
    packageId: string,
  ): Promise<InstallmentFeeBasis | null> {
    const pkg = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: {
        buyerId: true,
        packageNumber: true,
        orders: {
          select: {
            id: true,
            checkoutGroupId: true,
            shippingAddress: true,
            installmentFeeAmount: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!pkg) return null;
    const feeOrders = pkg.orders.filter((order) =>
      orderInstallmentFeeOf(order).gt(0),
    );
    if (feeOrders.length === 0) return null;

    const orderIds = pkg.orders.map((order) => order.id);
    const groupIds = [
      ...new Set(
        pkg.orders
          .map((order) => order.checkoutGroupId)
          .filter((id): id is string => !!id),
      ),
    ];
    // The payment that captured the fee: one per package (a package never
    // spans two checkouts). The DB guard ties a fee to a captured attempt.
    const payment = await this.prisma.payment.findFirst({
      where: {
        installmentFeeAmount: { gt: 0 },
        chargeAttemptId: { not: null },
        OR: [
          { orderId: { in: orderIds } },
          ...(groupIds.length ? [{ checkoutGroupId: { in: groupIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderId: true,
        checkoutGroupId: true,
        installmentFeeAmount: true,
        chargeAttempt: { select: { feeVatRatePct: true } },
      },
    });

    const refunds = await this.prisma.refundAttempt.findMany({
      where: {
        status: RefundAttemptStatus.finalized,
        OR: [
          { orderId: { in: orderIds } },
          ...(payment ? [{ paymentId: payment.id }] : []),
        ],
      },
      select: { orderId: true, paymentId: true, installmentFeeAmount: true },
    });
    const refundedOf = (orderId: string) =>
      refunds
        .filter((r) => r.orderId === orderId)
        .reduce(
          (sum, r) => sum.plus(refundInstallmentFeeOf(r)),
          new Prisma.Decimal(0),
        );
    const paymentRefunded = payment
      ? refunds
          .filter((r) => r.paymentId === payment.id)
          .reduce(
            (sum, r) => sum.plus(refundInstallmentFeeOf(r)),
            new Prisma.Decimal(0),
          )
      : new Prisma.Decimal(0);
    const paymentFeeFullyRefunded =
      !!payment && paymentRefunded.gte(payment.installmentFeeAmount);

    const paymentOrders: Prisma.OrderWhereInput | null =
      payment?.checkoutGroupId
        ? { checkoutGroupId: payment.checkoutGroupId }
        : payment?.orderId
          ? { id: payment.orderId }
          : null;
    const paymentPackageIds =
      paymentFeeFullyRefunded && paymentOrders
        ? [
            ...new Set(
              (
                await this.prisma.order.findMany({
                  where: paymentOrders,
                  select: { packageId: true },
                })
              )
                .map((order) => order.packageId)
                .filter((id): id is string => !!id),
            ),
          ]
        : [];

    const rate = payment?.chargeAttempt?.feeVatRatePct;
    return {
      buyerId: pkg.buyerId,
      packageNumber: pkg.packageNumber,
      // The guest's real identity is the same on every order of the package.
      shippingAddress: pkg.orders[0].shippingAddress,
      orders: pkg.orders.map((order) => ({
        id: order.id,
        fee: orderInstallmentFeeOf(order).toNumber(),
        refundedFee: refundedOf(order.id).toNumber(),
      })),
      paymentFeeFullyRefunded,
      vatRatePct: rate ? rate.toNumber() : null,
      paymentPackageIds,
    };
  }

  /**
   * Komisyon/hizmet bedeli faturasının ledger toplamları — hem iade ÖNCESİ brüt
   * matrah hem iade DÜŞÜLMÜŞ net matrah.
   *
   * `sourceId` normalde PAKET id'sidir; paket anahtarına geçilmeden önce kesilmiş
   * kayıtlarda SİPARİŞ id'si olabilir. İki nesil de buradan çözülür, böylece
   * çağıranlar anahtarın hangi nesil olduğunu bilmek zorunda kalmaz.
   */
  async resolveFeeLedgerTotals(sourceId: string): Promise<{
    sellerCommission: number;
    netSellerCommission: number;
    buyerFee: number;
    netBuyerFee: number;
  } | null> {
    const pkg = await this.prisma.orderPackage
      .findUnique({
        where: { id: sourceId },
        select: { orders: { select: { id: true } } },
      })
      .catch(() => null);
    const orderIds = pkg?.orders.length
      ? pkg.orders.map((o) => o.id)
      : [sourceId];

    const ledgers = await this.prisma.commissionLedger.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        sellerCommission: true,
        refundedSellerCommission: true,
        buyerFee: true,
        refundedBuyerFee: true,
        componentBreakdownComplete: true,
        buyerCommissionAmount: true,
        buyerPlatformFeeAmount: true,
        sellerCommissionAmount: true,
        sellerPlatformFeeAmount: true,
        refundedBuyerCommissionAmount: true,
        refundedBuyerPlatformFeeAmount: true,
        refundedSellerCommissionAmount: true,
        refundedSellerPlatformFeeAmount: true,
      },
    });
    if (ledgers.length === 0) return null;

    const sum = (values: number[]) =>
      Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

    return {
      sellerCommission: sum(
        ledgers.map((l) =>
          l.componentBreakdownComplete
            ? Number(l.sellerCommissionAmount) +
              Number(l.sellerPlatformFeeAmount)
            : Number(l.sellerCommission),
        ),
      ),
      netSellerCommission: sum(
        ledgers.map((l) =>
          l.componentBreakdownComplete
            ? Number(l.sellerCommissionAmount) +
              Number(l.sellerPlatformFeeAmount) -
              Number(l.refundedSellerCommissionAmount) -
              Number(l.refundedSellerPlatformFeeAmount)
            : Number(l.sellerCommission) -
              Number(l.refundedSellerCommission ?? 0),
        ),
      ),
      buyerFee: sum(
        ledgers.map((l) =>
          l.componentBreakdownComplete
            ? Number(l.buyerCommissionAmount) + Number(l.buyerPlatformFeeAmount)
            : Number(l.buyerFee),
        ),
      ),
      netBuyerFee: sum(
        ledgers.map((l) =>
          l.componentBreakdownComplete
            ? Number(l.buyerCommissionAmount) +
              Number(l.buyerPlatformFeeAmount) -
              Number(l.refundedBuyerCommissionAmount) -
              Number(l.refundedBuyerPlatformFeeAmount)
            : Number(l.buyerFee) - Number(l.refundedBuyerFee ?? 0),
        ),
      ),
    };
  }
}
