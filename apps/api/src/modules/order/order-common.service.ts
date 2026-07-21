import { Injectable, Optional, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { StorageService } from "../storage/storage.service";
import { OrderStatus, OfferStatus } from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";

/**
 * Sipariş modülü ortak yardımcıları (sipariş yanıtı formatlama + ürün cache
 * invalidation) — OrderService'ten birebir taşındı. Checkout/query/lifecycle
 * alt servisleri ve facade buraya delege eder (admin split'teki ortak
 * AdminAuditService deseniyle aynı).
 */
@Injectable()
export class OrderCommonService {
  private readonly logger = new Logger(OrderCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  /**
   * Invalidate product caches when product status changes
   */
  async invalidateProductCaches(productId: string): Promise<void> {
    try {
      await this.cache.del(`products:detail:${productId}`);
      await this.cache.delPattern("products:list:*");
      this.logger.log(`Product cache invalidated for ${productId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate product cache: ${error}`);
    }
  }

  /**
   * Resolve product image URL (S3 key -> presigned URL)
   */
  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    // avatars S3'te public-read → cache'lenebilir doğrudan URL (presigned'a gerek yok)
    return this.storageService?.getPublicAssetUrl(avatarUrl) ?? null;
  }

  resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    if (imageKeyOrUrl.includes("dev/") || imageKeyOrUrl.includes("prod/")) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  /**
   * Get hasProductRating and hasSellerRating for buyer (used in formatOrderResponse)
   */
  private async getOrderRatingFlags(
    order: any,
    userId: string,
  ): Promise<{ hasProductRating?: boolean; hasSellerRating?: boolean }> {
    const isBuyer = order.buyerId === userId;
    if (!isBuyer || !order.productId || !order.sellerId) {
      return {};
    }
    const [productRating, userRating] = await Promise.all([
      this.prisma.productRating.findFirst({
        where: { orderId: order.id, userId },
      }),
      this.prisma.rating.findFirst({
        where: {
          orderId: order.id,
          giverId: userId,
          receiverId: order.sellerId,
        },
      }),
    ]);
    return {
      hasProductRating: !!productRating,
      hasSellerRating: !!userRating,
    };
  }

  /**
   * Sipariş "Ödemeyi tamamla" ile yeniden aktive edilebilir mi?
   * reactivate() ile birebir aynı kural — UI yalnızca gerçekten reactivate
   * edilebilen siparişte butonu göstersin (backend'in reddedeceği yerde asla).
   * offer/product include edilmemişse güvenli şekilde false döner (liste görünümleri).
   */
  private computeCanReactivate(order: any, userId: string): boolean {
    if (order.status !== OrderStatus.cancelled) return false;
    if (order.buyerId !== userId) return false;
    if (!order.offerId || !order.offer) return false;
    if (order.offer.status !== OfferStatus.accepted) return false;
    if (!order.product) return false;
    const available = getAvailableQuantity(order.product);
    if (available !== null && available < 1) return false;
    return true;
  }

  /**
   * Ham cancelReason'ı stabil bir kategoriye eşler; frontend bu kategoriye göre
   * kullanıcı dostu mesaj gösterir. Admin'in yazdığı serbest metinler 'other'
   * olarak kalır ve ham haliyle gösterilir. Sadece iptal edilmiş siparişler için
   * anlamlıdır; aksi halde null döner.
   */
  private deriveCancelCategory(order: any): string | null {
    if (order.status !== OrderStatus.cancelled) return null;
    const reason = (order.cancelReason ?? "").trim();
    if (!reason) return "buyer_cancelled";
    if (reason === "Ödeme süresi (24 saat) doldu") return "payment_timeout";
    if (reason.startsWith("Satıcı belirlenen süre")) return "seller_no_ship";
    if (reason.includes("Stok tüken")) return "stockout";
    if (reason.includes("takas")) return "trade_reserved";
    if (reason === "Yeni toplu sipariş ile değiştirildi")
      return "bulk_replaced";
    if (reason === "Alıcı lehine iptal edildi") return "admin_buyer_favor";
    if (
      reason === "Admin tarafından iptal edildi" ||
      reason.startsWith("Admin force-cancel")
    )
      return "admin";
    return "other";
  }

  /**
   * Format order response
   */
  async formatOrderResponse(order: any, userId: string) {
    const resolvedImageUrl = this.resolveProductImageUrl(
      order.product?.images?.[0]?.cardKey,
    );
    const product = order.product
      ? {
          id: order.product.id,
          title: order.product.title,
          imageUrl: resolvedImageUrl,
          status: order.product.status,
          price:
            order.product.price != null
              ? Number(order.product.price)
              : undefined,
          condition: order.product.condition,
        }
      : null;

    // trackingNumber = OzelKargoTakipNo (bizim ref); cargoCode = gerçek Sürat
    // KargoTakipNo (providerTrackingId). UI ve Sürat takip sayfası GERÇEK kodu
    // ister — sipariş numarası orada çözülmez.
    const trackingNumber = order.shipment?.trackingNumber ?? null;
    const cargoCode = order.shipment?.providerTrackingId ?? null;
    const trackingUrl =
      cargoCode && order.shipment?.provider === "surat"
        ? `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(cargoCode)}`
        : null;

    const totalAmount = Number(order.totalAmount ?? 0);
    const shippingCost = Number(order.shippingCost ?? 0);
    const buyerFeeAmount = Number(order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(order.commissionAmount ?? 0);
    const taxAmount = Number(order.taxAmount ?? 0);
    // E-ticaret stopajı (GVK 94/19): kurumsal satıcıda KDV hariç bedelden kesilir,
    // satıcı net kazancından düşülür (order.withholdingTaxAmount olarak persist edilir).
    const withholdingTaxAmount = Number(order.withholdingTaxAmount ?? 0);
    // Ürün tutarı KDV HARİÇ gösterilir; KDV ayrı satır olarak surface edilir.
    // (totalAmount = subtotal + kargo + buyerFee + KDV — bkz. createCheckoutQuote)
    const subtotal = totalAmount - shippingCost - buyerFeeAmount - taxAmount;
    // Net kazanç davranışı korunur: KDV gerçekte satıcı payout'una (escrow hold)
    // dahil edildiğinden net kazanca da dahildir → subtotal + KDV − sellerFee − stopaj.
    const sellerNetAmount = Math.max(
      0,
      subtotal + taxAmount - sellerFeeAmount - withholdingTaxAmount,
    );

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      taxAmount,
      withholdingTaxAmount,
      totalAmount,
      sellerNetAmount,
    };

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      // Üyelik/dijital siparişler sanal ürün + platform satıcısı olarak modellenir
      // (orderNumber "MEM-" öneki, shippingAddress { type: 'membership' }). Bu siparişlerde
      // yorum/iade/teslimat adresi gibi fiziksel-ürün aksiyonları geçerli değildir.
      isMembership:
        (order.orderNumber?.startsWith("MEM-") ?? false) ||
        (typeof order.shippingAddress === "object" &&
          (order.shippingAddress as any)?.type === "membership"),
      checkoutGroupId: order.checkoutGroupId ?? null,
      amount: totalAmount,
      totalAmount,
      commissionAmount,
      buyerFeeAmount,
      sellerFeeAmount,
      shippingCost,
      pricing,
      status: order.status,
      product,
      // Frontend items array bekliyor - tek ürünü items formatında da döndür
      items: product
        ? [
            {
              id: order.id,
              product,
              quantity: order.quantity ?? 1,
              price: Number(order.totalAmount),
            },
          ]
        : [],
      buyer: {
        ...order.buyer,
        avatarUrl: await this.resolveAvatarUrl(order.buyer?.avatarUrl),
      },
      seller: {
        ...order.seller,
        avatarUrl: await this.resolveAvatarUrl(order.seller?.avatarUrl),
      },
      shippingAddress:
        order.shippingAddress && typeof order.shippingAddress === "object"
          ? {
              id:
                (order.shippingAddress as any).id ||
                order.shippingAddressId ||
                "",
              title: (order.shippingAddress as any).title || "",
              fullName: (order.shippingAddress as any).fullName || "",
              phone: (order.shippingAddress as any).phone || "",
              address:
                (order.shippingAddress as any).address ||
                (order.shippingAddress as any).addressLine1 ||
                "",
              addressLine1:
                (order.shippingAddress as any).address ||
                (order.shippingAddress as any).addressLine1 ||
                "",
              addressLine2: (order.shippingAddress as any).addressLine2 || "",
              district: (order.shippingAddress as any).district || "",
              city: (order.shippingAddress as any).city || "",
              zipCode:
                (order.shippingAddress as any).zipCode ||
                (order.shippingAddress as any).postalCode ||
                "",
              postalCode:
                (order.shippingAddress as any).zipCode ||
                (order.shippingAddress as any).postalCode ||
                "",
            }
          : null,
      billingAddress: null, // Billing address not stored separately
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            provider: order.shipment.provider,
            trackingNumber: order.shipment.trackingNumber,
            // Gerçek Sürat kargo kodu (KargoTakipNo) — UI'da gösterilir, şubede verilir.
            cargoCode,
            trackingUrl,
            status: order.shipment.status,
            cost: order.shipment.cost ? Number(order.shipment.cost) : null,
            shippedAt: order.shipment.shippedAt ?? null,
            deliveredAt: order.shipment.deliveredAt ?? null,
          }
        : null,
      // Mobil sipariş detayı bu alanları üst seviyede okur (kargo kartı + zaman çizelgesi)
      trackingNumber,
      cargoCode,
      trackingUrl,
      // Ödeme tek üründe bile checkout group üzerinden bağlanır (order.payment genelde
      // null) → group payment'a düş; yoksa "Ödeme Yapıldı" zaman çizelgesi pasif kalır.
      paidAt: (order.payment ?? order.checkoutGroup?.payment)?.paidAt ?? null,
      shippedAt: order.shipment?.shippedAt ?? null,
      deliveredAt: order.deliveredAt ?? order.shipment?.deliveredAt ?? null,
      completedAt: order.completedAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancelReason: order.cancelReason ?? null,
      // 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). status para akışı için
      // 'refunded' olabilir; UI bu alanla "İade" yerine "İptal" gösterir.
      cancellationType: order.cancellationType ?? null,
      cancelCategory: this.deriveCancelCategory(order),
      canReactivate: this.computeCanReactivate(order, userId),
      confirmationDeadline: order.confirmationDeadline ?? null,
      buyerConfirmedAt: order.buyerConfirmedAt ?? null,
      isBuyer: order.buyerId === userId,
      isSeller: order.sellerId === userId,
      ...(await this.getOrderRatingFlags(order, userId)),
      offerId: order.offerId ?? undefined,
      payment: (() => {
        const p = order.payment ?? order.checkoutGroup?.payment ?? null;
        return p
          ? {
              id: p.id,
              status: p.status,
              amount: Number(p.amount),
              provider: p.provider,
              failureReason: p.failureReason ?? undefined,
            }
          : undefined;
      })(),
      activeRefundRequest: this.pickActiveRefundRequest(
        order.refundRequests ?? [],
      ),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private pickActiveRefundRequest(refundRequests: any[]): any | null {
    const activeStatuses = [
      "pending_review",
      "approved",
      "wait_for_delivery",
      "return_shipment_open",
      "return_in_transit",
      "return_delivered",
      "disputed",
    ];
    const active = refundRequests.find((r) =>
      activeStatuses.includes(r.status),
    );
    if (!active) {
      const refunded = refundRequests.find((r) => r.status === "refunded");
      if (refunded) {
        return {
          id: refunded.id,
          refundNumber: refunded.refundNumber,
          status: refunded.status,
          createdAt: refunded.createdAt,
          refundedAt: refunded.refundedAt,
        };
      }
      return null;
    }
    return {
      id: active.id,
      refundNumber: active.refundNumber,
      status: active.status,
      reason: active.reason,
      returnTrackingNumber: active.returnTrackingNumber,
      returnProvider: active.returnProvider,
      returnStatus: active.returnStatus,
      createdAt: active.createdAt,
    };
  }
}
