import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma";
import { ElogoService } from "./elogo.service";
import { TaxService } from "../tax/tax.service";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../notification/providers/smtp.provider";
import { buildInvoiceXml, type UblParty } from "./ubl/ubl-invoice.builder";
import type { ElogoDocumentType } from "./elogo.types";
import { Prisma, type ElogoInvoice } from "@prisma/client";
import type { InvoiceRefundReversePayload } from "../outbox/outbox.types";
import {
  renderEmailTemplate,
  substituteEmailVariables,
  getEmailTemplateSubject,
} from "../../common/helpers/email-template-renderer";

/**
 * Tarodan'ın KENDİ gelir e-belgelerini (komisyon, hizmet bedeli, üyelik, boost, iade)
 * eLogo'ya keser. Düzenleyen HEP platform firması (Serhatlar) — satıcı adına DEĞİL.
 *
 * İlkeler:
 *  - Tutarlar olay anındaki KAYITLI snapshot'tan gelir (CommissionLedger / MembershipPayment /
 *    ProductBoost). Oran/fiyat sonradan değişse bile kesilen fatura etkilenmez.
 *  - Idempotent: (type, sourceId) tekil; aynı kaynak iki kez kesilmez.
 *  - Non-blocking: hata ödeme/sipariş akışını ETKİLEMEZ; failed kayıt + retry cron.
 *  - Numara gap-free (ElogoDocSequence); retry aynı numara/ETTN'i yeniden kullanır.
 */
type RevenueType =
  | "commission"
  | "service_fee"
  | "membership"
  | "boost"
  | "trade_commission"
  | "platform_sale";

type ResolvedRefundAdjustment = InvoiceRefundReversePayload & {
  finalizedAt: Date;
};

const MAX_SEND_ATTEMPTS = 8;
const SEND_LEASE_MS = 10 * 60 * 1000;

const LINE_DESCRIPTION: Record<string, string> = {
  commission: "Aracılık hizmet (komisyon) bedeli",
  service_fee: "Hizmet bedeli",
  membership: "Üyelik / abonelik bedeli",
  boost: "İlan öne çıkarma (boost) bedeli",
  trade_commission: "Takas aracılık hizmet (komisyon) bedeli",
  platform_sale: "Ürün/hizmet bedeli",
  return_invoice: "İade faturası",
};

@Injectable()
export class ElogoInvoicingService {
  private readonly logger = new Logger(ElogoInvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogo: ElogoService,
    private readonly config: ConfigService,
    @Optional() private readonly taxService?: TaxService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly smtp?: SmtpProvider,
  ) {}

  // ───────────────────────── config ─────────────────────────
  private cfg(key: string, def = ""): string {
    return (this.config.get<string>(key) ?? def).trim();
  }
  private get vatRate(): number {
    return Number(this.cfg("ELOGO_VAT_RATE", "20")) || 20;
  }
  /**
   * Kesim anındaki KDV oranı: önce admin'in vergi config'i (TaxRegion/TaxRate, TR
   * varsayılan kuralı), yoksa ELOGO_VAT_RATE env (varsayılan 20). Kayıt snapshot'ı
   * (ElogoInvoice.vatRate) sonraki retry/iade adımlarında aynen kullanılır.
   */
  private async resolveVatRate(): Promise<number> {
    try {
      const resolved = await this.taxService?.resolveTaxRate("TR");
      if (resolved && resolved.rate > 0) return resolved.rate;
    } catch {
      // config çözülemedi — env fallback
    }
    return this.vatRate;
  }
  private get prefix(): string {
    return this.cfg("ELOGO_INVOICE_PREFIX", "TRD");
  }
  private get xsltUuid(): string | undefined {
    return this.cfg("ELOGO_INVOICE_XSLT_UUID") || undefined;
  }
  /** Saklanan tutarlar KDV dahil mi (gross)? Varsayılan: evet (tüketici fiyatları KDV dahildir). */
  private get amountsIncludeVat(): boolean {
    return (
      this.cfg("ELOGO_AMOUNTS_INCLUDE_VAT", "true").toLowerCase() !== "false"
    );
  }

  private supplierParty(): UblParty {
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
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  /** Saklanan tutar → KDV hariç matrah. amountsIncludeVat=false ise tutar zaten matrahtır. */
  private toNet(amount: number, vatRate: number): number {
    return this.amountsIncludeVat
      ? this.round2(amount / (1 + vatRate / 100))
      : this.round2(amount);
  }
  private invoiceAmounts(
    amount: number,
    vatRate: number,
  ): { net: number; tax: number; total: number } {
    const net = this.toNet(amount, vatRate);
    const tax = this.round2(net * (vatRate / 100));
    return { net, tax, total: this.round2(net + tax) };
  }
  private ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  private hms(d: Date): string {
    return d.toTimeString().slice(0, 8);
  }

  /** Gap-free belge numarası: PREFIX + yıl + 9 hane (ElogoDocSequence atomik artırım). */
  private async allocateInvoiceNumber(year: number): Promise<string> {
    return this.prisma.$transaction((tx) =>
      this.allocateInvoiceNumberInTransaction(tx, year),
    );
  }

  private async allocateInvoiceNumberInTransaction(
    tx: Prisma.TransactionClient,
    year: number,
  ): Promise<string> {
    const prefix = this.prefix;
    const row = await tx.elogoDocSequence.upsert({
      where: { prefix_year: { prefix, year } },
      create: { prefix, year, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    const last = row.lastValue;
    return `${prefix}${year}${String(last).padStart(9, "0")}`;
  }

  /** Alıcı (User) → UBL party + belge tipi (e-Fatura mükellefse EINVOICE). */
  private async resolveRecipient(userId: string): Promise<{
    vknTckn: string;
    name: string;
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
    const name = user?.companyName || user?.displayName || "Müşteri";

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
      party: this.buildParty(vknTckn, name, user?.email),
      documentType,
      alias,
    };
  }

  private buildParty(
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
  private async fetchAddress(userId?: string | null): Promise<{
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

  // ───────────────────────── public API (tetikleyiciler çağırır) ─────────────────────────

  /** Komisyon faturası → SATICIYA (ledger.sellerCommission). Sipariş "earned" olunca. */
  async issueCommissionInvoice(orderId: string): Promise<void> {
    const [order, ledger] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          sellerId: true,
          sellerCommissionAmount: true,
          sellerPlatformFeeAmount: true,
        },
      }),
      this.prisma.commissionLedger.findUnique({
        where: { orderId },
        select: { sellerCommission: true, refundedSellerCommission: true },
      }),
    ]);
    if (!order || !ledger) return;
    // Platform kendi ürününü satıyorsa komisyon = kendine kesilemez → atla (yerine platform_sale).
    if (await this.isPlatformSeller(order.sellerId)) return;
    // #88: NET komisyon faturalanır (kısmi iade edilen kısım düşülür). İade yoksa
    // refunded=0 → net=original (davranış aynı). Net ≤ 0 ise faturalanacak bir şey yok.
    const netCommission =
      Number(ledger.sellerCommission) -
      Number(ledger.refundedSellerCommission ?? 0);
    if (netCommission <= 0) return;
    // v2: satıcı kesintisi komisyon + platform hizmet bedelinden oluşabilir —
    // fatura kalem açıklaması bileşimi yansıtır (tek toplam tutar kesilir).
    const hasCommission = Number(order.sellerCommissionAmount ?? 0) > 0;
    const hasPlatformFee = Number(order.sellerPlatformFeeAmount ?? 0) > 0;
    const desc =
      hasCommission && hasPlatformFee
        ? "Aracılık komisyonu ve platform hizmet bedeli"
        : hasPlatformFee
          ? "Platform hizmet bedeli"
          : undefined; // komisyon-only → varsayılan LINE_DESCRIPTION.commission
    await this.cut("commission", orderId, order.sellerId, netCommission, desc);
  }

  /**
   * Platform (Tarodan Official Store) KENDİ ürününü sattığında → ALICIYA ürün e-Arşivi.
   * Tarodan satıcıdır; tam ürün tutarı (order.totalAmount) faturalanır. Yalnız platform satışında.
   */
  async issuePlatformSaleInvoice(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        sellerId: true,
        buyerId: true,
        totalAmount: true,
        checkoutGroupId: true,
      },
    });
    if (!order) return;
    if (!(await this.isPlatformSeller(order.sellerId))) return;
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { orderId },
          ...(order.checkoutGroupId
            ? [{ checkoutGroupId: order.checkoutGroupId }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const refundedOrders =
      ((payment?.metadata as Record<string, unknown> | null)?.refundedOrders as
        Record<string, number> | undefined) ?? {};
    const netSaleAmount = Math.max(
      0,
      Number(order.totalAmount) - Number(refundedOrders[orderId] ?? 0),
    );
    await this.cut("platform_sale", orderId, order.buyerId, netSaleAmount);
  }

  private async isPlatformSeller(sellerId: string): Promise<boolean> {
    const u = await this.prisma.user
      .findUnique({ where: { id: sellerId }, select: { sellerType: true } })
      .catch(() => null);
    return u?.sellerType === "platform";
  }

  /** Hizmet bedeli faturası → ALICIYA (ledger.buyerFee). Yalnız buyerFee > 0 ise. */
  async issueServiceFeeInvoice(orderId: string): Promise<void> {
    const [order, ledger] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          buyerId: true,
          sellerId: true,
          buyerServiceFeeAmount: true,
          buyerCommissionAmount: true,
        },
      }),
      this.prisma.commissionLedger.findUnique({
        where: { orderId },
        select: { buyerFee: true, refundedBuyerFee: true },
      }),
    ]);
    if (!order || !ledger) return;
    // Platform (Tarodan) KENDİ ürününü satıyorsa hizmet bedeli AYRI kesilmez — platform_sale faturası
    // zaten tam tutarı (buyer fee dahil) içerir. Aksi halde buyer fee çift faturalanır.
    if (await this.isPlatformSeller(order.sellerId)) return;
    // #88: NET hizmet bedeli (kısmi iade düşülür). İade yoksa net=original.
    const netBuyerFee =
      Number(ledger.buyerFee) - Number(ledger.refundedBuyerFee ?? 0);
    if (netBuyerFee <= 0) return;
    // v2: alıcı kesintisi koruma hizmet bedeli + alıcı komisyonundan oluşabilir.
    const hasService = Number(order.buyerServiceFeeAmount ?? 0) > 0;
    const hasBuyerCommission = Number(order.buyerCommissionAmount ?? 0) > 0;
    const desc =
      hasService && hasBuyerCommission
        ? "Alıcı koruma hizmet bedeli ve komisyonu"
        : hasBuyerCommission
          ? "Alıcı komisyonu"
          : undefined; // service-only → varsayılan LINE_DESCRIPTION.service_fee
    await this.cut("service_fee", orderId, order.buyerId, netBuyerFee, desc);
  }

  /** Üyelik faturası → ÜYEYE (membershipPayment.amount). */
  async issueMembershipInvoice(membershipPaymentId: string): Promise<void> {
    const mp = await this.prisma.membershipPayment.findUnique({
      where: { id: membershipPaymentId },
      select: { amount: true, membership: { select: { userId: true } } },
    });
    if (!mp?.membership) return;
    await this.cut(
      "membership",
      membershipPaymentId,
      mp.membership.userId,
      Number(mp.amount),
    );
  }

  /**
   * Üyelik faturası → MEM- SİPARİŞTEN (membershipPayment kaydı oluşmuyor; üyelik alımı
   * yalnız MEM- order + tier upgrade yapıyor). Alıcıya, order.totalAmount üzerinden. sourceId=orderId.
   */
  async issueMembershipInvoiceForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, totalAmount: true, productId: true },
    });
    if (!order || !order.productId?.startsWith("membership-")) return;
    await this.cut(
      "membership",
      orderId,
      order.buyerId,
      Number(order.totalAmount),
    );
  }

  /** Outbox handler: ödenmiş sanal siparişin kaynak kaydını taze çözerek faturalandır. */
  async issueVirtualOrderInvoice(
    orderId: string,
    kind: "membership" | "boost",
  ): Promise<void> {
    if (kind === "boost") {
      const boost = await this.prisma.productBoost.findUnique({
        where: { orderId },
        select: { id: true },
      });
      if (!boost) {
        throw new Error(`Boost record not found for paid order ${orderId}`);
      }
      await this.issueBoostInvoice(boost.id);
      return;
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: { providerPaymentId: true },
    });
    const membershipPayment = payment?.providerPaymentId
      ? await this.prisma.membershipPayment.findFirst({
          where: { providerPaymentId: payment.providerPaymentId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : null;
    if (membershipPayment) {
      await this.issueMembershipInvoice(membershipPayment.id);
    } else {
      await this.issueMembershipInvoiceForOrder(orderId);
    }
  }

  /** Boost faturası → SATICIYA (boost.price). Kalem açıklamasına paket adı eklenir. */
  async issueBoostInvoice(boostId: string): Promise<void> {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: boostId },
      select: { userId: true, price: true, packageName: true },
    });
    if (!boost) return;
    const desc = boost.packageName
      ? `${LINE_DESCRIPTION.boost} — ${boost.packageName}`
      : LINE_DESCRIPTION.boost;
    await this.cut("boost", boostId, boost.userId, Number(boost.price), desc);
  }

  /** Takas nakit komisyon faturası → ÖDEYENE (TradeCashPayment.commission; payer taşır). */
  async issueTradeCashCommissionInvoice(
    tradeCashPaymentId: string,
  ): Promise<void> {
    const tcp = await this.prisma.tradeCashPayment.findUnique({
      where: { id: tradeCashPaymentId },
      select: { payerId: true, commission: true },
    });
    if (!tcp) return;
    await this.cut(
      "trade_commission",
      tradeCashPaymentId,
      tcp.payerId,
      Number(tcp.commission),
    );
  }

  /**
   * İade: siparişe ait Tarodan faturalarını refund-attempt oranında düzelt.
   * `adjustment` verilmezse eski tam-iade çağrıları için tüm kalan tutar terslenir.
   */
  async handleOrderRefund(
    orderId: string,
    adjustment?: InvoiceRefundReversePayload,
  ): Promise<void> {
    let resolved: ResolvedRefundAdjustment | undefined;
    if (adjustment) {
      if (
        adjustment.orderId !== orderId ||
        !(adjustment.refundRatio > 0 && adjustment.refundRatio <= 1)
      ) {
        throw new Error(`Invalid eLogo refund adjustment for order ${orderId}`);
      }
      const attempt = await this.prisma.refundAttempt.findUnique({
        where: { id: adjustment.refundAttemptId },
        select: {
          id: true,
          orderId: true,
          status: true,
          finalizedAt: true,
        },
      });
      if (
        !attempt ||
        attempt.orderId !== orderId ||
        attempt.status !== "finalized" ||
        !attempt.finalizedAt
      ) {
        throw new Error(
          `Refund attempt ${adjustment.refundAttemptId} is not finalized`,
        );
      }
      resolved = { ...adjustment, finalizedAt: attempt.finalizedAt };
    }
    await this.reverseByKeys(await this.relatedInvoiceKeys(orderId), resolved);
  }

  /** İade: takas nakit komisyon faturasını iptal/iade et. */
  async handleTradeCashRefund(tradeCashPaymentId: string): Promise<void> {
    await this.reverseByKeys([
      { type: "trade_commission", sourceId: tradeCashPaymentId },
    ]);
  }

  /** Bir siparişe bağlı tüm gelir faturası anahtarları (orderId / boostId / membershipPaymentId). */
  private async relatedInvoiceKeys(
    orderId: string,
  ): Promise<Array<{ type: string; sourceId: string }>> {
    const keys: Array<{ type: string; sourceId: string }> = [
      { type: "commission", sourceId: orderId },
      { type: "service_fee", sourceId: orderId },
      { type: "platform_sale", sourceId: orderId },
      { type: "membership", sourceId: orderId },
    ];
    const boost = await this.prisma.productBoost
      .findUnique({ where: { orderId }, select: { id: true } })
      .catch(() => null);
    if (boost) keys.push({ type: "boost", sourceId: boost.id });
    const pay = await this.prisma.payment
      .findFirst({
        where: { orderId },
        select: { providerPaymentId: true },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null);
    if (pay?.providerPaymentId) {
      const mp = await this.prisma.membershipPayment
        .findFirst({
          where: { providerPaymentId: pay.providerPaymentId },
          select: { id: true },
        })
        .catch(() => null);
      if (mp) keys.push({ type: "membership", sourceId: mp.id });
    }
    return keys;
  }

  private async reverseByKeys(
    keys: Array<{ type: string; sourceId: string }>,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    const failures: string[] = [];
    for (const k of keys) {
      const inv = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type: k.type as any, sourceId: k.sourceId } },
      });
      if (!inv || inv.status === "cancelled") continue;
      try {
        if (inv.status === "processing") {
          throw new Error(
            `invoice ${inv.invoiceNumber ?? inv.id} is currently being sent`,
          );
        }
        if (inv.status === "pending" || inv.status === "failed") {
          await this.repriceUnsentInvoice(inv, adjustment);
          continue;
        }
        if (inv.status === "sent" || inv.status === "signed") {
          // Fatura bu refund finalize edildikten sonra kesildiyse finansal kaynaklar
          // zaten net tutarı taşıyordu; aynı attempt için ikinci kez ters kayıt üretme.
          if (
            adjustment &&
            inv.refundAdjustedAt &&
            inv.refundAdjustedAt >= adjustment.finalizedAt
          ) {
            continue;
          }
          await this.reverseInvoice(inv, adjustment);
        }
      } catch (error: any) {
        const message = `${inv.invoiceNumber ?? inv.id}: ${error?.message ?? error}`;
        failures.push(message);
        this.logger.error(`eLogo iade/iptal hata (${message})`);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `eLogo invoice adjustment failed: ${failures.join("; ")}`,
      );
    }
  }

  /**
   * Henüz sağlayıcıya gitmemiş belgeyi güncel refund snapshot'ına netleştir.
   * Tam iadede belge yerel olarak iptal edilir ve hiçbir zaman gönderilmez.
   */
  private async repriceUnsentInvoice(
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    const gross = adjustment ? await this.resolveCurrentInvoiceGross(inv) : 0;
    if (gross <= 0.009) {
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: "refunded_before_issue",
          refundAdjustedAt: adjustment?.finalizedAt,
        },
      });
      return;
    }
    const rate = Number(inv.vatRate);
    const amounts = this.invoiceAmounts(gross, rate);
    await this.prisma.elogoInvoice.update({
      where: { id: inv.id },
      data: {
        netAmount: amounts.net,
        taxAmount: amounts.tax,
        total: amounts.total,
        status: "pending",
        elogoResultMsg: null,
        refundAdjustedAt: adjustment?.finalizedAt,
      },
    });
  }

  /** İade sonrası ilgili faturanın bugün itibarıyla kesilmesi gereken net brüt tutar. */
  private async resolveCurrentInvoiceGross(inv: ElogoInvoice): Promise<number> {
    if (inv.type === "commission" || inv.type === "service_fee") {
      const ledger = await this.prisma.commissionLedger.findUnique({
        where: { orderId: inv.sourceId },
        select: {
          sellerCommission: true,
          refundedSellerCommission: true,
          buyerFee: true,
          refundedBuyerFee: true,
        },
      });
      if (!ledger) return 0;
      return inv.type === "commission"
        ? Math.max(
            0,
            Number(ledger.sellerCommission) -
              Number(ledger.refundedSellerCommission ?? 0),
          )
        : Math.max(
            0,
            Number(ledger.buyerFee) - Number(ledger.refundedBuyerFee ?? 0),
          );
    }

    if (inv.type === "platform_sale" || inv.type === "membership") {
      const order = await this.prisma.order
        .findUnique({
          where: { id: inv.sourceId },
          select: { id: true, totalAmount: true, checkoutGroupId: true },
        })
        .catch(() => null);
      if (order) {
        return this.resolveNetOrderAmount(
          order.id,
          order.checkoutGroupId,
          Number(order.totalAmount),
        );
      }
    }

    if (inv.type === "boost") {
      const boost = await this.prisma.productBoost
        .findUnique({
          where: { id: inv.sourceId },
          select: { orderId: true, price: true },
        })
        .catch(() => null);
      if (boost?.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: boost.orderId },
          select: { checkoutGroupId: true, totalAmount: true },
        });
        if (order) {
          const orderNet = await this.resolveNetOrderAmount(
            boost.orderId,
            order.checkoutGroupId,
            Number(order.totalAmount),
          );
          const ratio =
            Number(order.totalAmount) > 0
              ? orderNet / Number(order.totalAmount)
              : 0;
          return Math.max(0, Number(boost.price) * ratio);
        }
      }
    }

    return Number(inv.total);
  }

  private async resolveNetOrderAmount(
    orderId: string,
    checkoutGroupId: string | null,
    orderTotal: number,
  ): Promise<number> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [{ orderId }, ...(checkoutGroupId ? [{ checkoutGroupId }] : [])],
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const refundedOrders =
      ((payment?.metadata as Record<string, unknown> | null)?.refundedOrders as
        Record<string, number> | undefined) ?? {};
    return Math.max(0, orderTotal - Number(refundedOrders[orderId] ?? 0));
  }

  /** Cron: pending/failed ve lease'i düşmüş processing kayıtları yeniden dener. */
  async retryPendingInvoices(maxAttempts = 8, batch = 50): Promise<void> {
    if (!this.elogo.isEnabled()) return;
    const staleBefore = new Date(Date.now() - SEND_LEASE_MS);
    const pend = await this.prisma.elogoInvoice.findMany({
      where: {
        OR: [
          {
            status: { in: ["pending", "failed"] },
            attemptCount: { lt: maxAttempts },
          },
          { status: "processing", lastAttemptAt: { lt: staleBefore } },
        ],
      },
      take: batch,
      orderBy: { createdAt: "asc" },
    });
    for (const inv of pend) {
      await this.sendRecord(inv.id).catch((e) =>
        this.logger.error(
          `eLogo retry hata (${inv.invoiceNumber}): ${e?.message}`,
        ),
      );
    }
  }

  // ───────────────────────── app: görüntüleme/indirme ─────────────────────────

  /** Kullanıcının kendi e-Arşiv faturaları (uygulamada listelemek için). */
  async listForUser(userId: string) {
    const rows = await this.prisma.elogoInvoice.findMany({
      where: { recipientUserId: userId, status: { in: ["sent", "signed"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        invoiceNumber: true,
        documentType: true,
        total: true,
        issuedAt: true,
        status: true,
        sourceId: true,
        ettn: true,
        lineDescription: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      label: r.lineDescription || LINE_DESCRIPTION[r.type] || "Fatura",
      invoiceNumber: r.invoiceNumber,
      documentType: r.documentType,
      total: r.total,
      issuedAt: r.issuedAt,
      sourceId: r.sourceId,
    }));
  }

  /**
   * Bir SİPARİŞE ait, kullanıcının kendi e-Arşiv faturası (varsa). App'te "Faturayı İndir"
   * butonunu yalnız fatura HAZIRSA (sent/signed) göstermek için. Yoksa null.
   */
  async findOrderInvoiceForUser(orderId: string, userId: string) {
    const sel = {
      id: true,
      invoiceNumber: true,
      type: true,
      total: true,
      issuedAt: true,
      lineDescription: true,
    } as const;
    // 1) Sipariş/üyelik e-Arşivleri: sourceId = orderId (komisyon/hizmet/platform satış/üyelik).
    //    (Üyelik alımı MEM- order üzerinden kesilir; sourceId=orderId.)
    let inv = await this.prisma.elogoInvoice.findFirst({
      where: {
        sourceId: orderId,
        recipientUserId: userId,
        type: {
          in: ["commission", "service_fee", "platform_sale", "membership"],
        },
        status: { in: ["sent", "signed"] },
      },
      orderBy: { createdAt: "desc" },
      select: sel,
    });
    // 2) BOOST e-Arşivi: sourceId = productBoost.id (order üzerinden boost'u bul).
    if (!inv) {
      const boost = await this.prisma.productBoost
        .findUnique({ where: { orderId }, select: { id: true } })
        .catch(() => null);
      if (boost) {
        inv = await this.prisma.elogoInvoice.findFirst({
          where: {
            sourceId: boost.id,
            recipientUserId: userId,
            type: "boost",
            status: { in: ["sent", "signed"] },
          },
          orderBy: { createdAt: "desc" },
          select: sel,
        });
      }
    }
    if (!inv) return null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      label: inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Fatura",
      total: inv.total,
      issuedAt: inv.issuedAt,
    };
  }

  /**
   * Kullanıcının bir e-Arşiv faturasının indirme URL'i (S3 presigned, public → app açabilir).
   * PDF S3'te yoksa eLogo'dan canlı çekilip yüklenir + pdfUrl kaydedilir. Sahiplik kontrollü.
   * Storage yoksa son çare: buffer döner (controller stream eder).
   */
  async getInvoiceDownload(
    invoiceId: string,
    userId?: string,
  ): Promise<{ url?: string; buffer?: Buffer; invoiceNumber: string }> {
    // userId verilmişse sahiplik kontrollü (kullanıcı ucu); verilmemişse admin (tüm faturalar).
    const inv = await this.prisma.elogoInvoice.findFirst({
      where: userId
        ? { id: invoiceId, recipientUserId: userId }
        : { id: invoiceId },
      select: { id: true, ettn: true, invoiceNumber: true, pdfUrl: true },
    });
    if (!inv?.ettn || !inv.invoiceNumber)
      throw new NotFoundException("e-Arşiv faturası bulunamadı");

    let key = inv.pdfUrl;
    const storageOk = !!this.storage?.isStorageAvailable?.();

    // S3'te yoksa canlı çek → yükle → kaydet.
    if (!key && storageOk) {
      const pdf = await this.elogo
        .getEArchiveInvoicePdf(inv.ettn)
        .catch(() => null);
      if (pdf && pdf.length > 200) {
        try {
          const up = await this.storage!.uploadFile(pdf, {
            bucket: "documents",
            folder: "elogo-invoices",
            filename: `${inv.invoiceNumber}.pdf`,
            mimeType: "application/pdf",
            isPublic: false,
            entityType: "elogo_invoice",
            entityId: inv.id,
          } as any);
          key = up.key;
          await this.prisma.elogoInvoice
            .update({ where: { id: inv.id }, data: { pdfUrl: key } })
            .catch(() => undefined);
        } catch {
          return { buffer: pdf, invoiceNumber: inv.invoiceNumber }; // S3 olmazsa stream
        }
      }
    }

    if (key && storageOk) {
      const url = await this.storage!.getPresignedDownloadUrl(
        "documents",
        key,
        3600,
      ).catch(() => null);
      if (url) return { url, invoiceNumber: inv.invoiceNumber };
    }
    // Son çare: canlı buffer (storage yok).
    const buffer = await this.elogo
      .getEArchiveInvoicePdf(inv.ettn)
      .catch(() => null);
    if (!buffer) throw new NotFoundException("Fatura PDF alınamadı");
    return { buffer, invoiceNumber: inv.invoiceNumber };
  }

  // ───────────────────────── core ─────────────────────────

  /** Gelir faturası kes (idempotent). Hata YUTULUR (non-blocking) — failed kayıt + cron retry. */
  private async cut(
    type: RevenueType,
    sourceId: string,
    recipientUserId: string,
    grossAmount: number,
    /** Kesim anında snapshot'lanan kalem açıklaması; boşsa LINE_DESCRIPTION[type]. */
    lineDescription?: string,
  ): Promise<void> {
    try {
      const providerEnabled = this.elogo.isEnabled();
      if (!providerEnabled) {
        this.logger.debug(
          `eLogo kapalı — ${type} faturası pending kaydedilecek (source=${sourceId})`,
        );
      }
      if (!(grossAmount > 0)) return;

      const existing = await this.prisma.elogoInvoice.findUnique({
        where: { type_sourceId: { type, sourceId } },
      });
      if (
        existing &&
        (existing.status === "sent" || existing.status === "signed")
      )
        return; // zaten kesildi
      if (existing) {
        if (providerEnabled) {
          await this.sendRecord(existing.id); // failed/pending → yeniden dene
        }
        return;
      }

      const recipient = await this.resolveRecipient(recipientUserId);
      const now = new Date();
      const vatRate = await this.resolveVatRate();
      const amounts = this.invoiceAmounts(grossAmount, vatRate);

      // Sequence artışı ve unique(type,sourceId) aynı SERIALIZABLE transaction'da:
      // yarışın kaybedeni numara tüketmez; kazanan kayıt tek ETTN ile gönderilir.
      const record = await this.prisma.$transaction(
        async (tx) => {
          const raced = await tx.elogoInvoice.findUnique({
            where: { type_sourceId: { type, sourceId } },
          });
          if (raced) return raced;
          const invoiceNumber = await this.allocateInvoiceNumberInTransaction(
            tx,
            now.getFullYear(),
          );
          return tx.elogoInvoice.create({
            data: {
              type,
              sourceId,
              recipientUserId,
              recipientVknTckn: recipient.vknTckn,
              recipientName: recipient.name,
              documentType: recipient.documentType,
              sendType: "ELEKTRONIK",
              invoiceNumber,
              ettn: randomUUID(),
              netAmount: amounts.net,
              taxAmount: amounts.tax,
              total: amounts.total,
              originalTotal: amounts.total,
              vatRate,
              status: "pending",
              lineDescription: lineDescription?.trim() || null,
              createdAt: now,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (providerEnabled) {
        await this.sendRecord(record.id);
      }
    } catch (err: any) {
      // Idempotency yarışı (aynı anda iki create) veya beklenmedik hata — yut, cron toparlar.
      this.logger.error(
        `eLogo ${type} faturası kesimi hata (source=${sourceId}): ${err?.message}`,
      );
    }
  }

  /**
   * DB tabanlı gönderim lease'i. Aynı pending/failed belgeyi yalnız bir API/worker
   * instance'ı sağlayıcıya yollar; çöken processing lease'i cron tarafından alınabilir.
   */
  private async claimInvoiceForSend(
    invoiceId: string,
  ): Promise<{ invoice: ElogoInvoice; reconcileFirst: boolean } | null> {
    const current = await this.prisma.elogoInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!current) return null;
    if (
      current.status === "sent" ||
      current.status === "signed" ||
      current.status === "cancelled"
    ) {
      return null;
    }
    if (
      current.status !== "processing" &&
      current.attemptCount >= MAX_SEND_ATTEMPTS
    ) {
      return null;
    }
    const staleBefore = new Date(Date.now() - SEND_LEASE_MS);
    if (
      current.status === "processing" &&
      current.lastAttemptAt &&
      current.lastAttemptAt >= staleBefore
    ) {
      return null;
    }

    const claim = await this.prisma.elogoInvoice.updateMany({
      where: {
        id: current.id,
        status: current.status,
        attemptCount: current.attemptCount,
        ...(current.status === "processing"
          ? { lastAttemptAt: current.lastAttemptAt }
          : {}),
      },
      data: {
        status: "processing",
        attemptCount:
          current.status === "processing"
            ? current.attemptCount
            : { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claim.count !== 1) return null;
    const invoice = await this.prisma.elogoInvoice.findUnique({
      where: { id: current.id },
    });
    if (!invoice) return null;
    return {
      invoice,
      reconcileFirst:
        current.status === "processing" || current.attemptCount > 0,
    };
  }

  /** Kayıttaki snapshot'tan UBL üretip gönderir, durumu günceller. */
  private async sendRecord(invoiceId: string): Promise<void> {
    const claimed = await this.claimInvoiceForSend(invoiceId);
    if (!claimed) return;
    const inv = claimed.invoice;
    const now = new Date();
    const issueMoment = inv.issuedAt ?? inv.createdAt;
    let currentNumber = inv.invoiceNumber ?? "";

    if (!inv.invoiceNumber || !inv.ettn || !inv.recipientVknTckn) {
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: {
          status: "failed",
          elogoResultMsg:
            "Missing invoice number, ETTN or recipient identifier",
        },
      });
      return;
    }

    const net = Number(inv.netAmount);
    const rate = Number(inv.vatRate);
    const isReturn = inv.type === "return_invoice";

    // Provider geçici olarak kapalıyken kayıt EARCHIVE açılmış olabilir. İlk gerçek
    // gönderimde alıcı mükellefiyetini tekrar çöz; return belgesi orijinal tipini korur.
    let documentType = inv.documentType as ElogoDocumentType;
    let alias: string | undefined;
    const isRealIdentifier =
      inv.recipientVknTckn !== "11111111111" &&
      (inv.recipientVknTckn.length === 10 ||
        inv.recipientVknTckn.length === 11);
    if (!isReturn && isRealIdentifier) {
      const chk = await this.elogo
        .checkUser(inv.recipientVknTckn)
        .catch(() => null);
      if (!chk) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            elogoResultMsg: "Recipient e-Invoice status could not be resolved",
          },
        });
        return;
      }
      documentType = chk?.isEInvoiceUser ? "EINVOICE" : "EARCHIVE";
      alias = chk?.isEInvoiceUser ? chk.eInvoicePkAlias : undefined;
      if (documentType !== inv.documentType) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: { documentType },
        });
      }
    } else if (documentType === "EINVOICE") {
      const chk = await this.elogo
        .checkUser(inv.recipientVknTckn)
        .catch(() => null);
      alias = chk?.eInvoicePkAlias;
    }
    const isEInvoice = documentType === "EINVOICE";
    if (isEInvoice) {
      if (!alias) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "failed",
            elogoResultMsg: "E-INVOICE recipient alias could not be resolved",
          },
        });
        return;
      }
    }

    // Alıcı e-postası + adresi UBL'e konur — eLogo e-Arşiv'i (ELEKTRONIK) bu e-postaya gönderir.
    const [recipientUser, addr] = await Promise.all([
      inv.recipientUserId
        ? this.prisma.user
            .findUnique({
              where: { id: inv.recipientUserId },
              select: { email: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      this.fetchAddress(inv.recipientUserId),
    ]);
    const party = this.buildParty(
      inv.recipientVknTckn,
      inv.recipientName || "Müşteri",
      recipientUser?.email,
      addr,
    );
    const desc =
      inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Hizmet bedeli";

    let billingRef: { invoiceId: string; issueDate: string } | undefined;
    if (isReturn && inv.billingReference) {
      billingRef = {
        invoiceId: inv.billingReference,
        issueDate: this.ymd(inv.billingReferenceIssueDate ?? issueMoment),
      };
    }

    const buildXml = (invoiceNumber: string) =>
      buildInvoiceXml({
        profileId: isEInvoice ? "TEMELFATURA" : "EARSIVFATURA",
        invoiceTypeCode: isReturn ? "IADE" : "SATIS",
        id: invoiceNumber,
        uuid: inv.ettn,
        issueDate: this.ymd(issueMoment),
        issueTime: this.hms(issueMoment),
        currency: "TRY",
        // Gönderim şekli yalnız e-Arşiv'de gerekli (e-Fatura'da AdditionalDocumentReference yok).
        sendType: isEInvoice ? undefined : "ELEKTRONIK",
        note: desc,
        supplier: this.supplierParty(),
        customer: party,
        lines: [{ name: desc, quantity: 1, unitPrice: net, vatRate: rate }],
        ...(billingRef ? { billingReference: billingRef } : {}),
      });

    const deliver = (invoiceNumber: string, total: number) => {
      void this.deliverPdf(
        {
          id: inv.id,
          ettn: inv.ettn!,
          invoiceNumber,
          type: inv.type,
          total,
          currentPdfUrl: inv.pdfUrl,
          recipientName: inv.recipientName,
          lineDescription: inv.lineDescription,
        },
        recipientUser?.email ?? null,
      ).catch((e) =>
        this.logger.warn(
          `eLogo PDF teslim hatası (${invoiceNumber}): ${e?.message}`,
        ),
      );
    };

    // Önceki deneme sırasında provider başarı verip DB güncellenememiş olabilir.
    // Aynı ETTN'i yeniden yollamadan önce durum sorgusuyla mutabakat yap.
    if (claimed.reconcileFirst) {
      const providerStatus = await this.elogo
        .getDocumentStatus(inv.ettn, documentType)
        .catch(() => null);
      if (providerStatus?.isCancel) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: now,
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg: providerStatus.description ?? null,
          },
        });
        return;
      }
      if (
        providerStatus &&
        (providerStatus.status === 2 || providerStatus.code === 1300)
      ) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "sent",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg: providerStatus.description ?? null,
            issuedAt: issueMoment,
            sentAt: now,
          },
        });
        deliver(inv.invoiceNumber, Number(inv.total));
        return;
      }
      if (providerStatus?.status === 1) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "processing",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg:
              providerStatus.description ?? "Provider is still processing",
          },
        });
        return;
      }
    }

    // Paylaşımlı eLogo hesabında (özellikle demo) fatura numarası çakışırsa yeni numara
    // alıp boşluğa kadar atlayarak yeniden dener. Böylece taze bir DB'nin sequence'i,
    // hesapta zaten kullanılmış numaralarla otomatik hizalanır (elle müdahale gerekmez).
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const { xml, totals } = buildXml(currentNumber);
        const res = await this.elogo.sendDocument({
          documentType,
          documentUuid: inv.ettn,
          documentNumber: currentNumber,
          ublXml: xml,
          signed: false,
          ...(alias ? { alias } : {}),
          ...(this.xsltUuid ? { xsltUuid: this.xsltUuid } : {}),
        });

        if (res.success) {
          await this.prisma.elogoInvoice.update({
            where: { id: inv.id },
            data: {
              invoiceNumber: currentNumber,
              netAmount: totals.taxExclusive,
              taxAmount: totals.tax,
              total: totals.payable,
              status: "sent",
              elogoRefId: res.refId != null ? String(res.refId) : null,
              elogoResultCode: res.code ?? null,
              elogoResultMsg: res.description ?? null,
              issuedAt: issueMoment,
              sentAt: now,
            },
          });
          this.logger.log(
            `eLogo ${inv.type} faturası gönderildi (${currentNumber}, ref=${res.refId})`,
          );
          deliver(currentNumber, totals.payable);
          return;
        }

        // Numara çakışması → ARTAN adımla ileri atla (ardışık dolu numara bloğunu az
        // denemede geç: 1,2,3,... büyüyen sıçrama; 12 denemede ~78 numaralık blok aşılır).
        if (attempt < 11 && this.isDuplicateNumberError(res.description)) {
          const skip = attempt + 1;
          for (let s = 0; s < skip; s++) {
            currentNumber = await this.allocateInvoiceNumber(
              issueMoment.getFullYear(),
            );
          }
          this.logger.warn(
            `eLogo numara çakışması → +${skip} atlanıp ${currentNumber} ile tekrar (${inv.type})`,
          );
          continue;
        }

        // Başka bir red (veya çakışma denemeleri tükendi) → failed olarak işaretle.
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            netAmount: totals.taxExclusive,
            taxAmount: totals.tax,
            total: totals.payable,
            status: "failed",
            elogoResultCode: res.code ?? null,
            elogoResultMsg: res.description ?? null,
          },
        });
        this.logger.error(
          `eLogo ${inv.type} faturası reddedildi (${currentNumber}): ${res.description}`,
        );
        return;
      }
    } catch (err: any) {
      await this.prisma.elogoInvoice
        .update({
          where: { id: inv.id },
          data: {
            invoiceNumber: currentNumber,
            status: "failed",
            elogoResultMsg: String(err?.message || err).slice(0, 500),
          },
        })
        .catch(() => undefined);
      this.logger.error(
        `eLogo ${inv.type} faturası gönderim hatası (${currentNumber}): ${err?.message}`,
      );
    }
  }

  /** eLogo "aynı fatura numarası tekrar kullanılamaz" reddini tanı (paylaşımlı hesapta numara çakışması). */
  private isDuplicateNumberError(msg?: string | null): boolean {
    if (!msg) return false;
    const m = msg.toLocaleLowerCase("tr");
    return (
      m.includes("tekrar kullanılamaz") ||
      m.includes("aynı fatura numarası") ||
      (m.includes("daha önce") && m.includes("fatura"))
    );
  }

  /**
   * Kesilen e-Arşiv PDF'ini eLogo'dan çek → S3'e kaydet → alıcıya KENDİ SMTP'mizden e-postala.
   * Demo eLogo mail atmadığı için maili biz atıyoruz; PDF de uygulamada gösterilebilsin diye S3'te.
   * Tamamen best-effort: hata kesimi etkilemez.
   */
  private async deliverPdf(
    inv: {
      id: string;
      ettn: string;
      invoiceNumber: string;
      type: string;
      total: any;
      currentPdfUrl: string | null;
      recipientName?: string | null;
      lineDescription?: string | null;
    },
    recipientEmail: string | null,
  ): Promise<void> {
    // MAIL-ONCE GARANTİSİ: bu fatura zaten maillendiyse ASLA tekrar gönderme. Çok sayıda tetik
    // (completeOrder/confirmDelivery/admin/cron/at_warehouse) aynı faturayı işleyebilir; emailSentAt
    // dolu ise çık. (cut() zaten sent'te no-op yapar; bu ikinci emniyet — yarış durumları için.)
    const fresh = await this.prisma.elogoInvoice
      .findUnique({ where: { id: inv.id }, select: { emailSentAt: true } })
      .catch(() => null);
    if (fresh?.emailSentAt) {
      this.logger.debug(
        `eLogo mail zaten gönderilmiş (${inv.invoiceNumber}) — tekrar atlanıyor`,
      );
      return;
    }
    const pdf = await this.elogo
      .getEArchiveInvoicePdf(inv.ettn)
      .catch(() => null);
    if (!pdf || pdf.length < 200) {
      this.logger.warn(
        `eLogo PDF alınamadı (${inv.invoiceNumber}) — S3/mail atlandı`,
      );
      return;
    }
    // 1) S3'e kaydet (documents bucket).
    let pdfKey = inv.currentPdfUrl;
    try {
      if (this.storage?.isStorageAvailable?.()) {
        const up = await this.storage.uploadFile(pdf, {
          bucket: "documents",
          folder: "elogo-invoices",
          filename: `${inv.invoiceNumber}.pdf`,
          mimeType: "application/pdf",
          isPublic: false,
          entityType: "elogo_invoice",
          entityId: inv.id,
        } as any);
        pdfKey = up.key;
      }
    } catch (e: any) {
      this.logger.warn(
        `eLogo PDF S3 yükleme hatası (${inv.invoiceNumber}): ${e?.message}`,
      );
    }
    // 2) Alıcıya kendi SMTP'mizden e-postala (PDF ekli). Şablon = admin'den düzenlenebilir
    //    'elogo-invoice' (DB override) → yoksa koddaki güzel Tarodan varsayılanı.
    let emailedAt: Date | null = null;
    try {
      if (recipientEmail && this.smtp) {
        const desc =
          inv.lineDescription || LINE_DESCRIPTION[inv.type] || "Hizmet bedeli";
        const tplKey = "elogo-invoice";
        const tplData = {
          recipientName: inv.recipientName || "Değerli Müşterimiz",
          description: desc,
          invoiceNumber: inv.invoiceNumber,
          total: Number(inv.total),
          type: inv.type,
        };
        const frontendUrl = this.config.get<string>(
          "FRONTEND_URL",
          "https://tarodan.com",
        );
        const dbTpl = await this.prisma.emailTemplate
          .findUnique({ where: { key: tplKey } })
          .catch(() => null);
        const html = dbTpl?.bodyHtml
          ? substituteEmailVariables(dbTpl.bodyHtml, tplData)
          : renderEmailTemplate(tplKey, tplData, frontendUrl);
        const subject = dbTpl?.subject
          ? substituteEmailVariables(dbTpl.subject, tplData)
          : getEmailTemplateSubject(tplKey, tplData);
        await this.smtp.sendEmail({
          to: recipientEmail,
          subject,
          html,
          attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdf }],
        } as any);
        emailedAt = new Date();
      }
    } catch (e: any) {
      this.logger.warn(
        `eLogo PDF e-posta hatası (${inv.invoiceNumber}): ${e?.message}`,
      );
    }
    // 3) Kaydı güncelle (pdfUrl + emailSentAt).
    await this.prisma.elogoInvoice
      .update({
        where: { id: inv.id },
        data: { pdfUrl: pdfKey, emailSentAt: emailedAt },
      })
      .catch(() => undefined);
    this.logger.log(
      `eLogo PDF teslim (${inv.invoiceNumber}): S3=${pdfKey ? "OK" : "-"} mail=${emailedAt ? recipientEmail : "-"}`,
    );
  }

  /**
   * Kesilmiş faturayı tersine çevir. Tam ve daha önce düzeltme almamış e-Arşiv
   * ≤8 günde iptal edilir; diğer durumlarda attempt-bazlı IADE faturası kesilir.
   */
  private async reverseInvoice(
    inv: ElogoInvoice,
    adjustment?: ResolvedRefundAdjustment,
  ): Promise<void> {
    if (!inv.ettn || !inv.invoiceNumber || !inv.issuedAt) {
      throw new Error(`Invoice ${inv.id} is missing reversal identifiers`);
    }
    const priorReturns = await this.prisma.elogoInvoice.findMany({
      where: {
        type: "return_invoice",
        billingReference: inv.invoiceNumber,
        status: { not: "cancelled" },
      },
      select: { total: true },
    });
    const alreadyReversed = this.round2(
      priorReturns.reduce((sum, row) => sum + Number(row.total), 0),
    );
    const remaining = this.round2(
      Math.max(0, Number(inv.total) - alreadyReversed),
    );
    if (remaining <= 0.009) return;

    const canCancel =
      (!adjustment || adjustment.fullyRefunded) &&
      alreadyReversed <= 0.009 &&
      inv.documentType === "EARCHIVE" &&
      this.elogo.refundStrategy(inv.issuedAt) === "CANCEL";

    if (canCancel) {
      let cancellationOutcomeUnknown = false;
      const res = await this.elogo
        .cancelEArchiveInvoice(inv.ettn, inv.elogoRefId ?? undefined)
        .catch((e: any) => {
          cancellationOutcomeUnknown = true;
          return {
            success: false,
            description: String(e?.message),
          } as any;
        });
      if (res.success) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            elogoResultMsg: res.description ?? null,
          },
        });
        this.logger.log(`eLogo iptal ${inv.invoiceNumber}: OK`);
        return;
      }
      // Timeout/transport hatasında provider iptali uygulamış olabilir. IADE
      // faturasına düşmeden önce ETTN durumunu sorgula; aksi halde çift ters kayıt olur.
      const providerStatus = await this.elogo
        .getDocumentStatus(inv.ettn, "EARCHIVE")
        .catch(() => null);
      if (providerStatus?.isCancel) {
        await this.prisma.elogoInvoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelReason: "refund",
            elogoResultCode: providerStatus.code ?? null,
            elogoResultMsg:
              providerStatus.description ?? res.description ?? null,
          },
        });
        return;
      }
      if (cancellationOutcomeUnknown && !providerStatus) {
        throw new Error(
          `Cancellation outcome is unknown for ${inv.invoiceNumber}`,
        );
      }
      // İptal BAŞARISIZ → İADE FATURASINA düş (her durumda reversal garanti; orijinali 'sent' bırak).
      this.logger.warn(
        `eLogo iptal başarısız (${inv.invoiceNumber}): ${res.description} → iade faturasına düşülüyor`,
      );
      await this.prisma.elogoInvoice.update({
        where: { id: inv.id },
        data: {
          cancelReason: "refund",
          elogoResultMsg: res.description ?? null,
        },
      });
      // aşağıdaki İADE FATURASI yoluna devam (return yok)
    }

    // İADE FATURASI: aynı refund attempt yeniden işlense bile aynı sourceId kullanılır.
    const reversalSourceId = adjustment
      ? `${inv.id}:${adjustment.refundAttemptId}`
      : inv.id;
    const exists = await this.prisma.elogoInvoice.findUnique({
      where: {
        type_sourceId: {
          type: "return_invoice",
          sourceId: reversalSourceId,
        },
      },
    });
    if (exists) {
      if (exists.status === "pending" || exists.status === "failed") {
        await this.sendRecord(exists.id);
      } else if (exists.status === "processing") {
        throw new Error(
          `Return invoice ${exists.invoiceNumber ?? exists.id} is processing`,
        );
      }
      return;
    }

    const baseGross = adjustment
      ? await this.resolveInvoiceRefundBase(inv)
      : Number(inv.total);
    const returnTotal = adjustment?.fullyRefunded
      ? remaining
      : Math.min(
          remaining,
          this.round2(baseGross * (adjustment?.refundRatio ?? 1)),
        );
    if (returnTotal <= 0.009) return;
    const originalTotal = Number(inv.total);
    const netRatio =
      originalTotal > 0 ? Number(inv.netAmount) / originalTotal : 0;
    const returnNet = this.round2(returnTotal * netRatio);

    const now = new Date();
    const record = await this.prisma.$transaction(
      async (tx) => {
        const raced = await tx.elogoInvoice.findUnique({
          where: {
            type_sourceId: {
              type: "return_invoice",
              sourceId: reversalSourceId,
            },
          },
        });
        if (raced) return raced;
        const number = await this.allocateInvoiceNumberInTransaction(
          tx,
          now.getFullYear(),
        );
        return tx.elogoInvoice.create({
          data: {
            type: "return_invoice",
            sourceId: reversalSourceId,
            recipientUserId: inv.recipientUserId,
            recipientVknTckn: inv.recipientVknTckn,
            recipientName: inv.recipientName,
            documentType: inv.documentType,
            sendType: "ELEKTRONIK",
            invoiceNumber: number,
            ettn: randomUUID(),
            netAmount: returnNet,
            taxAmount: this.round2(returnTotal - returnNet),
            total: returnTotal,
            originalTotal: returnTotal,
            vatRate: inv.vatRate,
            status: "pending",
            billingReference: inv.invoiceNumber,
            billingReferenceIssueDate: inv.issuedAt,
            lineDescription: `İade: ${
              inv.lineDescription ||
              LINE_DESCRIPTION[inv.type] ||
              "Hizmet bedeli"
            }`,
            createdAt: now,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.sendRecord(record.id);
  }

  /** Refund oranının uygulanacağı faturanın iade öncesi ekonomik brüt bazı. */
  private async resolveInvoiceRefundBase(inv: ElogoInvoice): Promise<number> {
    if (inv.type === "commission" || inv.type === "service_fee") {
      const ledger = await this.prisma.commissionLedger.findUnique({
        where: { orderId: inv.sourceId },
        select: { sellerCommission: true, buyerFee: true },
      });
      if (ledger) {
        const sourceAmount =
          inv.type === "commission"
            ? Number(ledger.sellerCommission)
            : Number(ledger.buyerFee);
        return this.invoiceAmounts(sourceAmount, Number(inv.vatRate)).total;
      }
    }
    if (inv.type === "platform_sale" || inv.type === "membership") {
      const order = await this.prisma.order
        .findUnique({
          where: { id: inv.sourceId },
          select: { totalAmount: true },
        })
        .catch(() => null);
      if (order) {
        return this.invoiceAmounts(
          Number(order.totalAmount),
          Number(inv.vatRate),
        ).total;
      }
      if (inv.type === "membership") {
        const membershipPayment = await this.prisma.membershipPayment
          .findUnique({
            where: { id: inv.sourceId },
            select: { amount: true },
          })
          .catch(() => null);
        if (membershipPayment) {
          return this.invoiceAmounts(
            Number(membershipPayment.amount),
            Number(inv.vatRate),
          ).total;
        }
      }
    }
    if (inv.type === "boost") {
      const boost = await this.prisma.productBoost
        .findUnique({
          where: { id: inv.sourceId },
          select: { price: true },
        })
        .catch(() => null);
      if (boost) {
        return this.invoiceAmounts(Number(boost.price), Number(inv.vatRate))
          .total;
      }
    }
    return Number(inv.originalTotal ?? inv.total);
  }
}
