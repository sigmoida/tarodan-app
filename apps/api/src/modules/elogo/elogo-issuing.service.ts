import { Injectable, Logger } from "@nestjs/common";
import { OrderStatus, type ElogoInvoiceType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { buildPlatformSaleLines } from "./invoice/invoice-lines";
import {
  LEGACY_PACKAGE_FEE_INVOICE_TYPES,
  PACKAGE_FEE_COMPONENT_BY_TYPE,
} from "./invoice/package-fee-components";
import { LINE_DESCRIPTION } from "./invoice/invoice-line-description";
import { buildPenaltyBasis } from "./invoice/penalty-basis";
import { resolveGuestInvoiceRecipient } from "./invoice/elogo-guest-recipient";
import { invoiceRecordReference } from "../../common/helpers/code-prefixes";
import { translateMessage } from "../i18n/translate";
import { ElogoDocumentService } from "./elogo-document.service";
import { ElogoDeliveryService } from "./elogo-delivery.service";

/**
 * Fatura KESME yolları — ElogoInvoicingService'ten birebir taşındı. Her biri
 * "şu olay oldu, karşılığında hangi belge kesilmeli?" sorusunu cevaplar:
 * teslim edilen sipariş, satıcı paketi, platform satışı, üyelik, öne çıkarma,
 * takas nakit ücreti.
 *
 * Üçü de aynı üç garantiyi paylaşır ve bu garantiler tek tek metotlarda değil
 * burada durur:
 *  - **Idempotent**: (type, sourceId) tekildir; aynı kaynak iki kez kesilmez.
 *  - **Bloklamaz**: kesim hatası ödeme/sipariş akışını ETKİLEMEZ; `cut` hatayı
 *    yutar, kurtarma cron'a bırakılır.
 *  - **Snapshot**: tutar kesim anındaki defterden okunur; oran sonradan
 *    değişse bile kesilmiş belge etkilenmez.
 *
 * Tutarı kendisi hesaplamaz (ElogoDocumentService) ve belgeyi kendisi
 * göndermez (ElogoDeliveryService) — yalnız hangi olayın hangi belgeyi
 * doğurduğunu bilir.
 */
@Injectable()
export class ElogoIssuingService {
  private readonly logger = new Logger(ElogoIssuingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ElogoDocumentService,
    private readonly delivery: ElogoDeliveryService,
  ) {}

  /** Komisyon faturası → SATICIYA (ledger.sellerCommission). Sipariş "earned" olunca. */
  /**
   * Teslim edilen siparişin TÜM gelir faturalarını keser (komisyon, hizmet bedeli,
   * platform satışı) ve hepsi başarılıysa siparişe `revenueInvoicedAt` işaretini koyar.
   *
   * TEK KAYNAK: teslim yaşam-döngüsü (OrderLifecycleService), teslim tx'inin outbox
   * görevi ve backfill cron'u aynı bu metodu çağırır. İşaret olmadan backfill her turda
   * tüm geçmişi taramak zorunda kalır ve aday penceresi doyduğunda yeni teslimatlar
   * faturasız kalabilir. Fatura türleri birbirini BLOKLAMAZ; biri patlarsa işaret
   * konmaz ve sonraki tur yeniden dener (issue* idempotenttir).
   */
  async issueOrderRevenueInvoices(orderId: string): Promise<void> {
    // Komisyon ve hizmet bedeli PAKET başına tek kesilir (satıcı başına tek
    // fatura); platform satışı ürün faturası olduğu için sipariş başına kalır.
    //
    // Paketin bir siparişi teslim olup diğeri olmadıysa fatura BEKLETİLİR:
    // erken kesilse paketin kalan kalemleri faturaya girmez ve ikinci teslimde
    // aynı sourceId idempotency yüzünden tamamlanamaz.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { packageId: true },
    });
    const packageId = order?.packageId ?? null;
    const packageReady = packageId
      ? await this.isPackageFullyDelivered(packageId)
      : false;

    // SIRALI kesim, paralel değil: belgeler aynı numara sayacı satırını artırır;
    // SERIALIZABLE transaction'lar aynı anda koşunca Postgres birini "write
    // conflict" (P2034) ile düşürüyor, kaybeden belge yalnız 10 dakikalık
    // backfill'de kesiliyor ve her çok belgeli teslimat Sentry'ye hata
    // yazıyordu. Belgeler birbirini BLOKLAMAZ: biri patlarsa diğerleri yine
    // denenir, işaret konmaz ve sonraki tur eksik olanı tamamlar.
    let failures = 0;
    const run = async (step: () => Promise<void>) => {
      try {
        await step();
      } catch (error: any) {
        failures++;
        this.logger.warn(
          `eLogo teslim faturası hatası ${orderId}: ${error?.message ?? error}`,
        );
      }
    };
    if (packageId && packageReady) {
      await run(() => this.issuePackageFeeInvoices(packageId));
    }
    await run(() => this.issuePlatformSaleInvoice(orderId));
    if (failures > 0) return;
    // Paket henüz tamamlanmadıysa komisyon/hizmet bedeli faturaları KESİLMEDİ.
    // İşareti şimdi koyarsak bu sipariş backfill penceresinden çıkar; kardeş
    // sipariş iptal edilirse paket faturası hiç kesilmez. İşaret, paket
    // faturaları gerçekten kesildiğinde konur.
    if (packageId && !packageReady) return;

    await this.prisma.order
      .update({
        where: { id: orderId },
        data: { revenueInvoicedAt: new Date() },
      })
      .catch((e: any) =>
        this.logger.warn(
          `revenueInvoicedAt işareti yazılamadı ${orderId}: ${e?.message}`,
        ),
      );
  }

  /**
   * Paketin TÜM siparişleri gelir aşamasına geçti mi (teslim/tamamlandı)?
   * Kısmi teslimde fatura kesilmez — bkz. issueOrderRevenueInvoices.
   */
  private async isPackageFullyDelivered(packageId: string): Promise<boolean> {
    const pending = await this.prisma.order.count({
      where: {
        packageId,
        status: {
          notIn: [
            OrderStatus.delivered,
            OrderStatus.completed,
            OrderStatus.awaiting_buyer_confirmation,
            OrderStatus.cancelled,
            OrderStatus.refunded,
          ],
        },
      },
    });
    return pending === 0;
  }

  /**
   * Bir SATICI PAKETİNİN fatura matrahı — komisyon ve hizmet bedeli faturalarının
   * TEK kaynağı.
   *
   * Fatura eskiden `orderId` anahtarlıydı, ama sepet her ÜRÜN için ayrı `Order`
   * açıyor: aynı satıcıdan iki ürün alan bir sepette o satıcıya iki komisyon +
   * iki hizmet bedeli faturası kesiliyordu. Paket ise satıcı başına tektir, bu
   * yüzden matrah paket düzeyinde toplanır ve satıcı başına TEK fatura çıkar;
   * kalemler paketin siparişlerinden gelir.
   *
   * Tutarlar ledger'dan NET okunur (kısmi iade düşülmüş). Kesim yapan üç yol —
   * teslim yaşam döngüsü, outbox görevi ve backfill cron'u — aynı bu matrahı
   * kullanır; hiçbiri kendi toplamasını yapmaz.
   */
  private async resolvePackageInvoiceBasis(packageId: string): Promise<{
    sellerId: string;
    buyerId: string;
    packageNumber: string;
    netCommission: number;
    netBuyerFee: number;
    hasSellerCommission: boolean;
    hasSellerPlatformFee: boolean;
    hasBuyerServiceFee: boolean;
    hasBuyerCommission: boolean;
    shippingAddress: unknown;
  } | null> {
    const pkg = await this.prisma.orderPackage.findUnique({
      where: { id: packageId },
      select: {
        sellerId: true,
        buyerId: true,
        packageNumber: true,
        orders: {
          select: {
            id: true,
            sellerCommissionAmount: true,
            sellerPlatformFeeAmount: true,
            buyerServiceFeeAmount: true,
            buyerCommissionAmount: true,
            shippingAddress: true,
          },
        },
      },
    });
    if (!pkg || pkg.orders.length === 0) return null;

    const totals = await this.documents.resolveFeeLedgerTotals(packageId);

    return {
      sellerId: pkg.sellerId,
      buyerId: pkg.buyerId,
      packageNumber: pkg.packageNumber,
      netCommission: totals?.netSellerCommission ?? 0,
      netBuyerFee: totals?.netBuyerFee ?? 0,
      hasSellerCommission: pkg.orders.some(
        (o) => Number(o.sellerCommissionAmount ?? 0) > 0,
      ),
      hasSellerPlatformFee: pkg.orders.some(
        (o) => Number(o.sellerPlatformFeeAmount ?? 0) > 0,
      ),
      hasBuyerServiceFee: pkg.orders.some(
        (o) => Number(o.buyerServiceFeeAmount ?? 0) > 0,
      ),
      hasBuyerCommission: pkg.orders.some(
        (o) => Number(o.buyerCommissionAmount ?? 0) > 0,
      ),
      // Misafir alıcı bilgisi paketteki siparişlerde aynıdır.
      shippingAddress: pkg.orders[0].shippingAddress,
    };
  }

  /**
   * Paketin HİZMET BAŞINA gelir faturaları — alıcıya üç, satıcıya üç.
   *
   * Her kesinti kaleminin kendi e-belgesi vardır (komisyon / hizmet bedeli /
   * kargo payı). Belge PAKET başınadır: sepette aynı satıcıdan iki ürün
   * alındığında `Order` iki tanedir ama gönderi, kargo ücreti ve ticari ilişki
   * tektir; sipariş anahtarlı kesim aynı hizmet için mükerrer belge üretiyordu.
   * Çok siparişli pakette kalemler ürün ürün satırlanır (`PackageFeeDocument.lines`).
   *
   * İKİ NESİL BİR ARADA YAŞAYAMAZ: paket daha önce birleşik `commission` /
   * `service_fee` ile faturalandıysa ya da kesinti defterinde kalem kırılımı
   * yoksa (v2 öncesi kayıt) ücret belgeleri ESKİ yoldan kesilir — aksi halde
   * aynı bedel hem birleşik hem kalem bazlı belgede yer alır ve mükerrer beyan
   * doğar. Kargo payı iki nesilde de kalem bazlıdır: birleşik belgeye hiç
   * girmiyordu, dolayısıyla mükerrer kesim riski taşımaz.
   *
   * Belgeler SIRALI kesilir (ortak numara sayacı) ve birbirini bloklamaz; biri
   * patlarsa diğerleri yine denenir ve metot sonunda hata fırlatılır, böylece
   * `revenueInvoicedAt` işareti konmaz ve sonraki tur eksiği tamamlar.
   */
  async issuePackageFeeInvoices(packageId: string): Promise<void> {
    const basis = await this.documents.resolvePackageFeeBasis(packageId);
    if (!basis) return;
    // Platform kendi ürününü satıyorsa kesintiler kendine faturalanamaz; alıcı
    // tarafı da `platform_sale` belgesinin kalemlerinde zaten yer alır.
    if (await this.isPlatformSeller(basis.sellerId)) return;

    const legacyIssued = await this.hasPackageInvoiceOfType(
      packageId,
      LEGACY_PACKAGE_FEE_INVOICE_TYPES,
    );
    const useLegacyFees = legacyIssued || !basis.componentBreakdownComplete;

    const steps: Array<() => Promise<void>> = [];
    if (useLegacyFees) {
      steps.push(
        () => this.issueCommissionInvoice(packageId),
        () => this.issueServiceFeeInvoice(packageId),
      );
    }
    for (const doc of basis.documents) {
      const isShipping =
        PACKAGE_FEE_COMPONENT_BY_TYPE[doc.type].source.kind === "shipping";
      if (useLegacyFees && !isShipping) continue;
      steps.push(() =>
        this.delivery.cut(
          doc.type,
          packageId,
          doc.side === "buyer" ? basis.buyerId : basis.sellerId,
          doc.net,
          {
            lineItems: doc.lines,
            sourceReference: invoiceRecordReference(basis.packageNumber),
            // Misafir siparişinde alıcının gerçek kimliği yalnız kargo
            // adresinde durur; satıcı tarafı için anlamsızdır.
            guestRecipient:
              doc.side === "buyer"
                ? resolveGuestInvoiceRecipient(basis.shippingAddress)
                : null,
          },
        ),
      );
    }

    const failures: string[] = [];
    for (const step of steps) {
      try {
        await step();
      } catch (error: any) {
        failures.push(String(error?.message ?? error));
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `eLogo paket ücret faturaları eksik (${packageId}): ${failures.join("; ")}`,
      );
    }
  }

  /** Paket için verilen türlerden İPTAL EDİLMEMİŞ bir belge var mı? */
  private async hasPackageInvoiceOfType(
    packageId: string,
    types: readonly ElogoInvoiceType[],
  ): Promise<boolean> {
    const row = await this.prisma.elogoInvoice
      .findFirst({
        where: {
          sourceId: packageId,
          type: { in: types as ElogoInvoiceType[] },
          status: { not: "cancelled" },
        },
        select: { id: true },
      })
      .catch(() => null);
    return !!row;
  }

  /** LEGACY: birleşik komisyon faturası → SATICIYA, satıcı paketi başına TEK. */
  async issueCommissionInvoice(packageId: string): Promise<void> {
    const basis = await this.resolvePackageInvoiceBasis(packageId);
    if (!basis) return;
    // Platform kendi ürününü satıyorsa komisyon kendine kesilemez → platform_sale.
    if (await this.isPlatformSeller(basis.sellerId)) return;
    if (basis.netCommission <= 0) return;

    const desc =
      basis.hasSellerCommission && basis.hasSellerPlatformFee
        ? "Aracılık komisyonu ve platform hizmet bedeli"
        : basis.hasSellerPlatformFee
          ? "Platform hizmet bedeli"
          : undefined;
    await this.delivery.cut(
      "commission",
      packageId,
      basis.sellerId,
      basis.netCommission,
      {
        lineDescription: desc,
        sourceReference: invoiceRecordReference(basis.packageNumber),
      },
    );
  }

  /** LEGACY: birleşik hizmet bedeli faturası → ALICIYA, satıcı paketi başına TEK. */
  async issueServiceFeeInvoice(packageId: string): Promise<void> {
    const basis = await this.resolvePackageInvoiceBasis(packageId);
    if (!basis) return;
    // Platform satışında hizmet bedeli platform_sale faturasına dahildir; ayrı
    // kesilirse çift faturalanır.
    if (await this.isPlatformSeller(basis.sellerId)) return;
    if (basis.netBuyerFee <= 0) return;

    const desc =
      basis.hasBuyerServiceFee && basis.hasBuyerCommission
        ? "Alıcı koruma hizmet bedeli ve komisyonu"
        : basis.hasBuyerCommission
          ? "Alıcı komisyonu"
          : undefined;
    await this.delivery.cut(
      "service_fee",
      packageId,
      basis.buyerId,
      basis.netBuyerFee,
      {
        lineDescription: desc,
        sourceReference: invoiceRecordReference(basis.packageNumber),
        guestRecipient: resolveGuestInvoiceRecipient(basis.shippingAddress),
      },
    );
  }

  /**
   * Platform (Tarodan Official Store) KENDİ ürününü sattığında → ALICIYA ürün e-Arşivi.
   * Tarodan satıcıdır; tam ürün tutarı (order.totalAmount) faturalanır. Yalnız platform satışında.
   *
   * Bu, alıcının ÜRÜN için aldığı tek yasal belgedir; bu yüzden tek satırlık bir
   * "hizmet bedeli" olarak değil, kalem kalem kesilir: ürün (adı, adedi, KATEGORİ
   * KDV'siyle) + kargo + hizmet bedeli.
   */
  async issuePlatformSaleInvoice(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        sellerId: true,
        buyerId: true,
        orderNumber: true,
        totalAmount: true,
        checkoutGroupId: true,
        shippingAddress: true,
        quantity: true,
        subtotal: true,
        buyerShippingAmount: true,
        buyerFeeAmount: true,
        product: { select: { title: true, categoryId: true } },
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
    const orderTotal = Number(order.totalAmount);
    const netSaleAmount = Math.max(
      0,
      orderTotal - Number(refundedOrders[orderId] ?? 0),
    );

    const categoryId = order.product?.categoryId ?? null;
    const [productVatRate, serviceVatRate] = await Promise.all([
      this.documents.resolveVatRate("platform_sale", categoryId),
      this.documents.resolveVatRate("service_fee"),
    ]);
    // Kısmi iadede tüm kalemler aynı oranda küçülür; belge her zaman gerçekte
    // elde kalan tutarı gösterir.
    const lineItems = buildPlatformSaleLines({
      productName: order.product?.title ?? "",
      quantity: Number(order.quantity ?? 1),
      productGross: Number(order.subtotal ?? 0),
      shippingNet: Number(order.buyerShippingAmount ?? 0),
      buyerFeeNet: Number(order.buyerFeeAmount ?? 0),
      productVatRate,
      serviceVatRate,
      ratio: orderTotal > 0 ? netSaleAmount / orderTotal : 0,
    });

    await this.delivery.cut(
      "platform_sale",
      orderId,
      order.buyerId,
      netSaleAmount,
      {
        guestRecipient: resolveGuestInvoiceRecipient(order.shippingAddress),
        categoryId,
        lineItems,
        // Ürün faturası SİPARİŞ anahtarlıdır (koli değil) — kayıt no da sipariş
        // numarasının gövdesinden türetilir.
        sourceReference: invoiceRecordReference(order.orderNumber),
      },
    );
  }

  /**
   * CEZA FATURASI → kusurlu tarafa, iade TALEBİ başına tek belge.
   *
   * Politika kusurluya yüklenen kargoyu (`*_charge`) zaten hesaplıyor ama hiçbir
   * belge kesmiyordu. Matrah SADECE FARKTIR (`penalty-basis.ts`): kusurluya
   * daha önce kesilmiş kargo belgesi ayakta kalır. Hizmet bedeli için de yeni
   * belge yoktur — `platform_retain` demek "kesilmiş belge geçerli" demektir;
   * komisyon ise mevcut iade faturası yolundan geri verilir.
   *
   * Anahtar `refundRequestId`: aynı kolinin birden fazla iadesi ayrı ayrı
   * cezalanır, aynı talebin yeniden işlenmesi ikinci belge doğurmaz.
   */
  async issuePenaltyInvoice(refundRequestId: string): Promise<void> {
    const request = await this.prisma.refundRequest
      .findUnique({
        where: { id: refundRequestId },
        select: {
          faultParty: true,
          resolvedReason: true,
          financialComponents: {
            select: {
              componentCode: true,
              treatment: true,
              netAmount: true,
            },
          },
          order: {
            select: {
              packageId: true,
              buyerId: true,
              sellerId: true,
              serviceVatRate: true,
              shippingAddress: true,
            },
          },
        },
      })
      .catch(() => null);
    const order = request?.order;
    if (!request || !order) return;
    // Platform kendi ürününü satıyorsa ceza kendine faturalanamaz.
    if (await this.isPlatformSeller(order.sellerId)) return;

    // Satıcıya paket için zaten kesilmiş gidiş kargo payı — cezadan düşülür.
    const invoicedSellerShipping = order.packageId
      ? await this.invoicedSellerShippingOf(order.packageId)
      : 0;

    const basis = buildPenaltyBasis({
      faultParty: request.faultParty,
      components: request.financialComponents.map((c) => ({
        componentCode: c.componentCode,
        treatment: c.treatment,
        netAmount: Number(c.netAmount),
      })),
      invoicedSellerShipping,
      vatRate: Number(order.serviceVatRate ?? 0),
    });
    if (!basis) return;

    const reason = request.resolvedReason
      ? translateMessage(`status.refundReason.${request.resolvedReason}`, "tr")
      : null;
    const packageNumber = order.packageId
      ? await this.packageNumberOf(order.packageId)
      : null;

    await this.delivery.cut(
      "penalty",
      refundRequestId,
      basis.side === "seller" ? order.sellerId : order.buyerId,
      basis.net,
      {
        lineItems: [basis.line],
        lineDescription: reason
          ? `${LINE_DESCRIPTION.penalty} — ${reason}`
          : LINE_DESCRIPTION.penalty,
        sourceReference: invoiceRecordReference(packageNumber) ?? undefined,
        guestRecipient:
          basis.side === "buyer"
            ? resolveGuestInvoiceRecipient(order.shippingAddress)
            : null,
      },
    );
  }

  /** Paketin satıcıya faturalanmış gidiş kargo payı toplamı. */
  private async invoicedSellerShippingOf(packageId: string): Promise<number> {
    const orders = await this.prisma.order
      .findMany({
        where: { packageId },
        select: { sellerShippingAmount: true },
      })
      .catch(() => []);
    return orders.reduce(
      (sum, o) => sum + Number(o.sellerShippingAmount ?? 0),
      0,
    );
  }

  private async packageNumberOf(packageId: string): Promise<string | null> {
    const pkg = await this.prisma.orderPackage
      .findUnique({
        where: { id: packageId },
        select: { packageNumber: true },
      })
      .catch(() => null);
    return pkg?.packageNumber ?? null;
  }

  private async isPlatformSeller(sellerId: string): Promise<boolean> {
    const u = await this.prisma.user
      .findUnique({ where: { id: sellerId }, select: { sellerType: true } })
      .catch(() => null);
    return u?.sellerType === "platform";
  }

  /** Üyelik faturası → ÜYEYE (membershipPayment.amount). */
  async issueMembershipInvoice(membershipPaymentId: string): Promise<void> {
    const mp = await this.prisma.membershipPayment.findUnique({
      where: { id: membershipPaymentId },
      select: { amount: true, membership: { select: { userId: true } } },
    });
    if (!mp?.membership) return;
    await this.delivery.cut(
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
    await this.delivery.cut(
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
    await this.delivery.cut(
      "boost",
      boostId,
      boost.userId,
      Number(boost.price),
      {
        lineDescription: desc,
      },
    );
  }

  /**
   * Takas ödeme satırının hizmet faturası → ÖDEYENE. Fatura TÜRÜ satırın kendi
   * verisinden gelir, sürüm bayrağından değil:
   *
   *  - v2 satırı `tradeFeeAmount` taşır → `trade_service_fee` (KDV DAHİL tutar,
   *    içinden ayrıştırılır)
   *  - v1 satırı `commission` taşır → `trade_commission` (KDV HARİÇ matrah, üstüne eklenir)
   *
   * Böylece iki sürüm aynı çağrı yolunu paylaşır ve v1 takasları eski kuralla biter.
   * v2'de İKİ satır vardır → taraf başına bir fatura (sourceId satır id'si, idempotent).
   */
  async issueTradeCashFeeInvoice(tradeCashPaymentId: string): Promise<void> {
    const tcp = await this.prisma.tradeCashPayment.findUnique({
      where: { id: tradeCashPaymentId },
      select: { payerId: true, commission: true, tradeFeeAmount: true },
    });
    if (!tcp) return;
    const tradeFee = Number(tcp.tradeFeeAmount ?? 0);
    if (tradeFee > 0) {
      await this.delivery.cut(
        "trade_service_fee",
        tradeCashPaymentId,
        tcp.payerId,
        tradeFee,
      );
      return;
    }
    const commission = Number(tcp.commission ?? 0);
    if (commission > 0) {
      await this.delivery.cut(
        "trade_commission",
        tradeCashPaymentId,
        tcp.payerId,
        commission,
      );
    }
  }
}
