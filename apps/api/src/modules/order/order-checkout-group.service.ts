import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { buyerTotalOf } from "./order-total.helper";
import { chargedProductBaseOf } from "./order-charged-base.helper";
import { paymentWindowEnd } from "../payment/payment.constants";
import { resolveSalePrice } from "../product/helpers/product-sale-window";
import { i18nMessage } from "../i18n";
import { CheckoutDto } from "./dto";
import {
  OrderStatus,
  ProductKind,
  ProductStatus,
  Prisma,
} from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { EventService } from "../events";
import { DiscountService } from "../discount";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import {
  OrderPricingService,
  CommissionResult,
  CommissionRuleSetSnapshot,
  ShippingTariffSnapshot,
} from "./order-pricing.service";
import { OrderCommonService } from "./order-common.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderFeeDiscountService } from "./order-fee-discount.service";
import type {
  AppliedFeeDiscount,
  FeeDiscountCandidate,
} from "../discount/fee-discount.engine";
import {
  allocateCouponAcrossLines,
  remainingDiscountAllowanceFor,
} from "../discount/fee-discount.engine";
import { distanceSalesConsent } from "./distance-sales-contract";
import {
  calculatePackageDesi,
  type ShippingBuyerShareByTier,
} from "../shipping/shipping-tariff.helper";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

/**
 * Toplu checkout (CheckoutGroup) akışı: sepetteki tüm ürünler tek grup + ürün
 * başına sipariş, tek ödeme grubu kapsar — OrderCheckoutService'ten birebir taşındı.
 * Sürat/vergi/komisyon primitifleri OrderCheckoutCommonService'te. DI: checkoutCommon
 * + leaf'ler (prisma, event, discount, surat, orderPricing, orderCommon); döngü yok.
 * findCheckoutGroupReplay public: guest checkoutGuest replay için çağırır.
 */
@Injectable()
export class OrderCheckoutGroupService {
  private readonly logger = new Logger(OrderCheckoutGroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly discountService: DiscountService,
    private readonly suratCargoService: SuratCargoService,
    private readonly orderPricing: OrderPricingService,
    private readonly orderCommon: OrderCommonService,
    private readonly checkoutCommon: OrderCheckoutCommonService,
    @Optional()
    private readonly feeDiscounts?: OrderFeeDiscountService,
  ) {}

  private formatCheckoutGroupCreateResponse(group: {
    id: string;
    groupNumber: string;
    totalAmount: Prisma.Decimal | number;
    orders: Array<{
      id: string;
      orderNumber: string;
      productId: string;
      totalAmount: Prisma.Decimal | number;
      subtotal: Prisma.Decimal | number | null;
      discountAmount: Prisma.Decimal | number;
      discountCode: string | null;
    }>;
  }) {
    return {
      checkoutGroupId: group.id,
      groupNumber: group.groupNumber,
      totalAmount: Number(group.totalAmount),
      orders: group.orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        productId: o.productId,
        totalAmount: Number(o.totalAmount),
        subtotal: o.subtotal != null ? Number(o.subtotal) : undefined,
        discountAmount: Number(o.discountAmount || 0),
        appliedCouponCode: o.discountCode ?? undefined,
      })),
      provider: "paytr",
      paymentUrl: "",
    };
  }

  async findCheckoutGroupReplay(idempotencyKey: string, buyerId?: string) {
    const existing = await this.prisma.checkoutGroup.findUnique({
      where: { idempotencyKey },
      include: { orders: true },
    });
    if (!existing) return null;
    if (buyerId && existing.buyerId !== buyerId) {
      throw new ForbiddenException(
        i18nMessage("server.order.notYourTransaction"),
      );
    }
    return {
      ...this.formatCheckoutGroupCreateResponse(existing),
      existingGroup: true,
    };
  }

  async createCheckoutGroup(params: {
    buyerId: string;
    dto: CheckoutDto;
    isGuest: boolean;
    guest?: { email: string; phone?: string; name?: string };
    shippingTariffSnapshot?: ShippingTariffSnapshot;
    commissionRuleSetSnapshot?: CommissionRuleSetSnapshot;
  }) {
    const { buyerId, dto, isGuest, guest } = params;

    if (!isGuest) {
      const replayed = await this.findCheckoutGroupReplay(
        dto.idempotencyKey,
        buyerId,
      );
      if (replayed) return replayed;
    }
    if (!dto.shippingAddressId && !dto.shippingAddress) {
      throw new BadRequestException(
        i18nMessage("server.order.shippingAddressRequiredWithFields"),
      );
    }
    const shippingTariff =
      params.shippingTariffSnapshot ??
      (await this.orderPricing.resolveShippingTariffSnapshot(
        dto.expectedShippingTariffVersion,
        true,
      ));
    const commissionRuleSet =
      params.commissionRuleSetSnapshot ??
      (await this.orderPricing.resolveCommissionRuleSetSnapshot(
        dto.expectedCommissionRuleSetId,
        dto.expectedCommissionRuleSetVersion,
        true,
      ));
    // Misafir kuponu: kişi-başı limit uygulanamaz (kimlik yok) — validateCoupon'a
    // userId=null geçilir; toplam limit + tarih + min sepet yine denetlenir.

    // Dedupe + sıralı kilitleme (deadlock önleme)
    const productIds = [...new Set(dto.items.map((i) => i.productId))].sort();

    let result;
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const lockedRows = await tx.$queryRaw<{ id: string }[]>`
          SELECT p.id
          FROM products p
          WHERE p.id IN (${Prisma.join(productIds)})
          ORDER BY p.id
          FOR UPDATE
        `;
          if ((lockedRows?.length ?? 0) !== productIds.length) {
            throw new NotFoundException(
              i18nMessage("server.order.cartProductNotFound"),
            );
          }

          // Aynı alıcının aynı ürün için eski bekleyen siparişi varsa iptal et ve
          // rezervasyonunu bırak — yoksa terk edilmiş checkout rezervasyonu yeni
          // denemede "stokta yok" hatasına yol açar. Bu, stok doğrulamasından ÖNCE
          // yapılmalı ki serbest kalan rezervasyon aşağıdaki product fetch'inde görünsün.
          if (!isGuest) {
            const staleOrders = await tx.order.findMany({
              where: {
                buyerId,
                productId: { in: productIds },
                status: OrderStatus.pending_payment,
              },
              include: { payment: { select: { id: true } } },
            });
            for (const stale of staleOrders) {
              await tx.order.update({
                where: { id: stale.id },
                data: {
                  status: OrderStatus.cancelled,
                  cancelReason: "Yeni toplu sipariş ile değiştirildi",
                  reservationReleasedAt:
                    stale.reservationReleasedAt ?? new Date(),
                },
              });
              // #1 (OVERSELL FIX): YALNIZ gerçekten rezervasyon TUTAN stale sipariş sayacı
              // düşürür. Kabul-edilmiş-ödenmemiş teklif siparişi (offerId var, payment yok)
              // hiç rezerve etmedi → düşürürsek paylaşılan reservedQuantity'den başka bir
              // (belki eşzamanlı) siparişin rezervini çalarız (oversell). release path'iyle
              // aynı predicate: rezerve iff (offerId null) VEYA (payment var).
              const staleHeldReservation =
                stale.offerId === null || stale.payment !== null;
              if (!stale.reservationReleasedAt && staleHeldReservation) {
                await tx.product.update({
                  where: { id: stale.productId },
                  // Adet bazlı: rezervasyon stale.quantity kadar açılır (1 değil) →
                  // çoklu-adet terk edilmiş sipariş rezervasyonu sızmasın.
                  data: {
                    reservedQuantity: { decrement: stale.quantity ?? 1 },
                  },
                });
              }
            }
            if (staleOrders.length > 0) {
              await this.discountService.releaseReservedUsageForOrders(
                staleOrders.map((stale) => stale.id),
                tx,
              );
            }
          }

          const products = await tx.product.findMany({
            where: {
              id: { in: productIds },
              kind: ProductKind.listing,
            },
            include: {
              seller: {
                select: { id: true, email: true, ...PUBLIC_NAME_SELECT },
              },
            },
          });
          const productMap = new Map(products.map((p) => [p.id, p]));

          // Adet haritası: aynı ürün sepette birden çok kez ise adetleri topla.
          const qtyByProduct = new Map<string, number>();
          for (const it of dto.items) {
            qtyByProduct.set(
              it.productId,
              (qtyByProduct.get(it.productId) ?? 0) + (it.quantity ?? 1),
            );
          }

          // Ürün doğrulamaları — hata gövdesinde productId döner (istemci stok ekranına yönlendirir)
          for (const productId of productIds) {
            const product = productMap.get(productId);
            if (!product) {
              throw new NotFoundException(
                i18nMessage("server.order.cartProductNotFound"),
              );
            }
            if (product.status !== ProductStatus.active) {
              throw new BadRequestException({
                message: `"${product.title}" satışta değil veya başkası tarafından satın alınıyor`,
                productId,
              });
            }
            const available = getAvailableQuantity(product);
            const reqQty = qtyByProduct.get(productId) ?? 1;
            // Medium A: BİRLEŞİK adedi (aynı ürünü sepete birden çok kez ekleyerek
            // toplanan qty) üst sınıra karşı da doğrula. Eskiden yalnız STOĞA karşı
            // bakılıyordu → 2×20 = 40 gibi girdiler @Max(20)/maxQuantityPerOrder'ı
            // aşabiliyordu. Sınır = ürünün maxQuantityPerOrder'ı VE global 20 tavanı.
            const HARD_CAP = 20;
            const perOrderCap = Math.min(
              HARD_CAP,
              product.maxQuantityPerOrder ?? HARD_CAP,
            );
            if (reqQty > perOrderCap) {
              throw new BadRequestException({
                message: `"${product.title}" için maksimum ${perOrderCap} adet alabilirsiniz (istenen ${reqQty})`,
                productId,
              });
            }
            if (available !== null && available < reqQty) {
              throw new BadRequestException({
                message: `"${product.title}" için yeterli stok yok (istenen ${reqQty}, mevcut ${available})`,
                productId,
              });
            }
            if (!isGuest && product.sellerId === buyerId) {
              throw new ForbiddenException(
                i18nMessage("server.order.cannotBuyOwnProduct"),
              );
            }
          }

          // Adres çözümü (grup için bir kez)
          let shippingAddress: any;
          let shippingAddressId: string | null = null;

          if (!isGuest && dto.shippingAddressId) {
            const savedAddress = await tx.address.findUnique({
              where: { id: dto.shippingAddressId },
            });
            if (!savedAddress || savedAddress.userId !== buyerId) {
              throw new BadRequestException(
                i18nMessage("server.order.invalidShippingAddress"),
              );
            }
            shippingAddress = savedAddress;
            shippingAddressId = savedAddress.id;
          } else if (dto.shippingAddress) {
            const addr = dto.shippingAddress;
            if (!addr.fullName?.trim()) {
              throw new BadRequestException(
                i18nMessage("server.order.shippingAddressNameRequired"),
              );
            }
            if (!addr.phone?.trim()) {
              throw new BadRequestException(
                i18nMessage("server.order.shippingAddressPhoneRequired"),
              );
            }
            if (!addr.city?.trim()) {
              throw new BadRequestException(
                i18nMessage("server.order.shippingAddressCityRequired"),
              );
            }
            if (!addr.district?.trim()) {
              throw new BadRequestException(
                i18nMessage("server.order.shippingAddressDistrictRequired"),
              );
            }
            if (!addr.address?.trim()) {
              throw new BadRequestException(
                i18nMessage("server.order.shippingAddressLineRequired"),
              );
            }
            if (isGuest) {
              shippingAddress = {
                id: "",
                title: "Teslimat Adresi",
                fullName: addr.fullName.trim(),
                phone: addr.phone.trim(),
                city: addr.city.trim(),
                district: addr.district.trim(),
                address: addr.address.trim(),
                zipCode: addr.zipCode?.trim() || null,
              };
            } else {
              const newAddress = await tx.address.create({
                data: {
                  userId: buyerId,
                  title: "Sipariş Adresi",
                  fullName: addr.fullName.trim(),
                  phone: addr.phone.trim(),
                  city: addr.city.trim(),
                  district: addr.district.trim(),
                  address: addr.address.trim(),
                  zipCode: addr.zipCode?.trim() || null,
                  isDefault: false,
                },
              });
              shippingAddress = newAddress;
              shippingAddressId = newAddress.id;
            }
          } else {
            throw new BadRequestException(
              i18nMessage("server.order.shippingAddressRequired"),
            );
          }

          // Fatura adresi: inline > kayıtlı ID > teslimatla aynı
          let billingAddress = shippingAddress;
          if (
            dto.billingAddress &&
            dto.billingAddress.fullName?.trim() &&
            dto.billingAddress.city?.trim() &&
            dto.billingAddress.address?.trim()
          ) {
            billingAddress = {
              id: "",
              title: "Fatura Adresi",
              fullName: dto.billingAddress.fullName.trim(),
              phone: (
                dto.billingAddress.phone ||
                shippingAddress.phone ||
                ""
              ).trim(),
              city: dto.billingAddress.city.trim(),
              district: (dto.billingAddress.district || "").trim(),
              address: dto.billingAddress.address.trim(),
              zipCode: dto.billingAddress.zipCode?.trim() || null,
            };
          } else if (
            !isGuest &&
            dto.billingAddressId &&
            dto.billingAddressId !== shippingAddressId
          ) {
            const billing = await tx.address.findUnique({
              where: { id: dto.billingAddressId },
            });
            if (!billing || billing.userId !== buyerId) {
              throw new BadRequestException(
                i18nMessage("server.order.invalidBillingAddress"),
              );
            }
            billingAddress = billing;
          }

          // F1.4: charged satır bazı = EFEKTİF (kampanya) fiyat — sepet/ürün kartı
          // hangi fiyatı gösteriyorsa checkout onu tahsil eder (aksi halde bir code=null
          // kampanya aktifken alıcı gösterilenden fazla öderdi). Kupon YİNE baz fiyat
          // üzerinden hesaplanır (sepet ile aynı taban → önizleme = tahsilat).
          const now = new Date();
          const effectiveMap =
            await this.discountService.getEffectiveDisplayPriceMany(
              productIds.map((productId) => {
                const p = productMap.get(productId)!;
                return {
                  productId,
                  sellerId: p.sellerId,
                  categoryId: p.categoryId ?? "",
                  // Kampanya, indirim penceresi UYGULANMIŞ fiyatın üstüne biner.
                  currentDisplayPrice: resolveSalePrice(p, now).price,
                };
              }),
            );

          // Fiyatlandırma (ürün başına) — createDirectOrder ile aynı kurallar
          const pricing = productIds.map((productId) => {
            const product = productMap.get(productId)!;
            // İndirim penceresi ORTAK kuraldan: pencere dışındaysa satış fiyatı
            // indirim öncesi fiyattır (vitrinle aynı sayı).
            const sale = resolveSalePrice(product, now);
            const basePrice = sale.price;
            const campaignPrice = effectiveMap.get(productId);
            const productPrice = campaignPrice ?? basePrice;
            const originalPrice = sale.oldPrice ?? basePrice;
            return {
              productId,
              product,
              quantity: qtyByProduct.get(productId) ?? 1,
              productPrice,
              originalPrice,
              productDiscount: Math.max(0, originalPrice - productPrice),
              couponDiscount: 0,
              quantityDiscount: 0,
              quantityCampaignId: null as string | null,
            };
          });

          // Adet koşullu satıcı kampanyaları (bogo / bulk_quantity): satır
          // bazında, quote ile ORTAK metottan (İ3/İ7) — önizleme = tahsilat.
          const quantityDiscounts =
            await this.discountService.quantityDiscountsForLines(
              pricing.map((entry) => ({
                productId: entry.productId,
                sellerId: entry.product.sellerId,
                categoryId: entry.product.categoryId,
                unitPrice: entry.productPrice,
                quantity: entry.quantity,
              })),
            );
          for (const entry of pricing) {
            const won = quantityDiscounts.get(entry.productId);
            entry.quantityDiscount = won?.amount ?? 0;
            entry.quantityCampaignId = won?.discountId ?? null;
          }

          // F1.3: quote'un birim-fiyat hash'i ile doğrula — ürün fiyatı/kampanya quote'tan
          // sonra değiştiyse 409 PRICING_CHANGED (sessiz farklı tahsil yok). Hash yoksa atlanır.
          this.orderPricing.assertPricingUnchanged(
            dto.expectedPricingHash,
            pricing.map((p) => ({
              productId: p.productId,
              unitPrice: p.productPrice,
              quantity: p.quantity,
              shippingDesi: p.product.shippingDesi,
            })),
          );

          // Kupon: tüm sepetle bir kez doğrula, indirimi fiyat oranında dağıt
          let appliedCouponCode: string | null = null;
          let appliedDiscountId: string | null = null;
          let appliedVoucherCodeId: string | undefined;
          // F2.4: kupon indiriminin platform payı [0,1] — her siparişin
          // platformFundedDiscount snapshot'ını hesaplamak için.
          let appliedPlatformFundedShare = 0;
          // Bedel hedefli kupon ürün tabanına dokunmaz; motora aday olarak geçer.
          let couponFeeCandidate: FeeDiscountCandidate | null = null;
          let couponEligibleIds = new Set<string>();
          if (dto.couponCode) {
            const validation = await this.discountService.validateCoupon(
              {
                code: dto.couponCode,
                // Adet bazlı: kupon doğrulama/indirim dağıtımı gerçek adetle yapılmalı
                // (1 değil) → yoksa yüzde kupon, minCartValue, maxDiscount tek-birim
                // fiyat üzerinden hesaplanıp çoklu-adet sepette alıcıyı fazla yükler.
                cartItems: productIds.map((productId) => ({
                  productId,
                  quantity: qtyByProduct.get(productId) ?? 1,
                })),
              },
              // Misafirde kişi-başı limit atlanır (paylaşımlı guest kimliği anlamsız).
              isGuest ? null : buyerId,
            );
            if (!validation.isValid) {
              throw new BadRequestException(
                validation.error ||
                  i18nMessage("server.order.invalidCouponCode"),
              );
            }
            if (validation.discount) {
              appliedCouponCode = dto.couponCode.toUpperCase();
              appliedDiscountId = validation.discount.id;
              appliedVoucherCodeId = validation.discount.voucherCodeId;
              appliedPlatformFundedShare =
                validation.discount.platformFundedShare;
              couponFeeCandidate =
                this.feeDiscounts?.couponCandidate(validation.discount) ?? null;
              couponEligibleIds = new Set(
                validation.discount.eligibleProductIds,
              );
              const totalCoupon = validation.discount.estimatedDiscount;
              // Kupon YALNIZ uygun (scope) satırlara, satır toplamı oranında
              // dağıtılır — uygun olmayan satıcı/kategori satırları indirim payı
              // ALMAZ (aksi halde kapsamlı bir kupon başka satıcıların payout
              // tabanını düşürürdü). Dağıtım + %50 tavan TEK kaynaktan (quote
              // ile birebir): kupon satır başına, satıcı indirimleri sonrası
              // tabanın yüzde MAX_TOTAL_DISCOUNT_PERCENT'ini aşamaz.
              const eligibleIds = new Set(
                validation.discount.eligibleProductIds,
              );
              const eligibleLines = pricing.filter((p) =>
                eligibleIds.has(p.productId),
              );
              const allocation = allocateCouponAcrossLines(
                eligibleLines.map((p) =>
                  Math.max(0, p.productPrice * p.quantity - p.quantityDiscount),
                ),
                totalCoupon,
              );
              eligibleLines.forEach((p, idx) => {
                p.couponDiscount = allocation.amounts[idx];
              });
            }
          }

          // Grup + sipariş numaraları
          const groupNumber = await generateUniqueReference(
            REFERENCE_PREFIX.checkoutGroup,
            async (code) =>
              (await this.prisma.checkoutGroup.count({
                where: { groupNumber: code },
              })) > 0,
          );

          const paymentExpiresAt = paymentWindowEnd();
          const orderInputs: Array<{
            pricingEntry: (typeof pricing)[number];
            orderNumber: string;
            commissionResult: CommissionResult;
            /** Bu satıra düşen bedel indirimleri (rapor + iade denetimi). */
            feeDiscountsApplied?: AppliedFeeDiscount[];
            /** Tahsil edilen ürün tabanı — `Order.subtotal`. */
            subtotal: number;
            shippingCost: number;
            fullShippingAmount: number;
            buyerShippingAmount: number;
            sellerShippingAmount: number;
            taxAmount: number;
            withholdingTaxAmount: number;
            buyerServiceTaxAmount: number;
            sellerServiceTaxAmount: number;
            serviceVatRate: number;
            totalAmount: number;
            suratIdempotencyKey: string;
          }> = [];

          // Faz 1 (satıcı-bazlı kargo): Kargo ücreti SATICI bazında hesaplanır. Aynı
          // satıcının paket-içi satır toplamı bedava-kargo eşiğini geçerse ücretsiz;
          // aksi halde satıcı başına TEK baseCost. Eskiden satır başına hesaplanıyordu
          // → aynı mağazadan N ürün = N kargo ücreti (alıcı fazla öderdi). Ücret her
          // satıcının İLK satırına yüklenir (kardeş satırlar 0) → order.totalAmount +
          // grup toplamı formülü değişmeden per-seller olur.
          const sellerLineSubtotals = new Map<string, number>();
          // Kupon ÖNCESİ satıcı alt-toplamları — yalnız ücretsiz kargo eşiği
          // için (İ14): kupon, kazanılmış ücretsiz kargoyu geri alamaz.
          const sellerListSubtotals = new Map<string, number>();
          const sellerDesiLines = new Map<
            string,
            Array<{ shippingDesi: number; quantity: number }>
          >();
          for (const entry of pricing) {
            const line = chargedProductBaseOf({
              unitPrice: entry.productPrice,
              quantity: entry.quantity,
              couponDiscount: entry.couponDiscount,
              quantityDiscount: entry.quantityDiscount,
            });
            sellerLineSubtotals.set(
              entry.product.sellerId,
              (sellerLineSubtotals.get(entry.product.sellerId) ?? 0) + line,
            );
            // Eşik kupon ÖNCESİ tutardan (İ14); satıcının adet kampanyası ise
            // kendi fiyat indirimi olduğundan eşiğe dahildir.
            sellerListSubtotals.set(
              entry.product.sellerId,
              (sellerListSubtotals.get(entry.product.sellerId) ?? 0) +
                (entry.productPrice * entry.quantity - entry.quantityDiscount),
            );
            const packageLines =
              sellerDesiLines.get(entry.product.sellerId) ?? [];
            packageLines.push({
              shippingDesi: entry.product.shippingDesi,
              quantity: entry.quantity,
            });
            sellerDesiLines.set(entry.product.sellerId, packageLines);
          }
          const sellerDesi = new Map(
            [...sellerDesiLines.entries()].map(([sellerId, packageLines]) => [
              sellerId,
              calculatePackageDesi(packageLines),
            ]),
          );
          // Kargo kararı satıcı PAKETİ düzeyinde verilir ve SIRA kritiktir: paketin
          // desisi kademeyi, kademe de payı belirler. Bu yüzden komisyonlar kargo
          // bölüşümünden ÖNCE hesaplanır — aksi halde yalnız kargonun yüklendiği İLK
          // satırın payı uygulanır ve önizlemeyle ayrışır. Karar, quote ile ORTAK
          // yardımcıdan gelir (DRY): az-göster/fazla-tahsil bug'ı bu yüzden kapandı.
          const lineCommissions: Array<{
            discountedPrice: number;
            commission: Awaited<
              ReturnType<OrderPricingService["calculateCommission"]>
            >;
          }> = [];
          const sellerShareLines = new Map<
            string,
            ShippingBuyerShareByTier[]
          >();
          const lineFeeDiscounts: AppliedFeeDiscount[][] = [];
          // Toplam indirim tavanı: satır adımının kullanmadığı pay aynı satıcının
          // paket (kargo) adımına devreder — quote ile birebir aynı muhasebe.
          const sellerAllowanceLeft = new Map<string, number>();
          // Kampanyalar sepet başına TEK kez yüklenir; alıcının katmanı da bir kez.
          const feeCampaigns = (await this.feeDiscounts?.preload()) ?? [];
          const buyerTier =
            (await this.feeDiscounts?.resolveBuyerTier(buyerId)) ?? null;
          const pinnedRuleSetId = commissionRuleSet.id;
          for (const entry of pricing) {
            const discountedPrice = chargedProductBaseOf({
              unitPrice: entry.productPrice,
              quantity: entry.quantity,
              couponDiscount: entry.couponDiscount,
              quantityDiscount: entry.quantityDiscount,
            });
            const rawCommission = await this.orderPricing.calculateCommission(
              discountedPrice,
              entry.product.sellerId,
              entry.product.categoryId,
              pinnedRuleSetId,
              entry.quantity > 0
                ? discountedPrice / entry.quantity
                : discountedPrice,
              entry.product.id,
            );
            // Komisyon/hizmet bedeli kampanyaları satır bazında (kargo aşağıda,
            // paket kararından sonra) — sepet önizlemesiyle birebir aynı sıra.
            // Tavan tabanı satıcı indirimi (adet kampanyası) SONRASI tutardır.
            const lineAllowance = remainingDiscountAllowanceFor({
              lineBase:
                entry.productPrice * entry.quantity - entry.quantityDiscount,
              couponDiscount: entry.couponDiscount,
            });
            const feeDiscounted = await this.feeDiscounts?.apply({
              context: {
                productId: entry.product.id,
                categoryId: entry.product.categoryId,
                sellerId: entry.product.sellerId,
                buyerId,
                buyerTier,
                quantity: entry.quantity,
              },
              commission: rawCommission,
              buyerShippingAmount: 0,
              sellerShippingAmount: 0,
              remainingAllowance: lineAllowance,
              preloaded: feeCampaigns,
              couponCandidates:
                couponFeeCandidate && couponEligibleIds.has(entry.product.id)
                  ? [couponFeeCandidate]
                  : [],
            });
            const commission = feeDiscounted?.commission ?? rawCommission;
            lineFeeDiscounts.push(feeDiscounted?.applied ?? []);
            sellerAllowanceLeft.set(
              entry.product.sellerId,
              (sellerAllowanceLeft.get(entry.product.sellerId) ?? 0) +
                Math.max(
                  0,
                  lineAllowance -
                    ((feeDiscounted?.buyerTotal ?? 0) +
                      (feeDiscounted?.sellerTotal ?? 0)),
                ),
            );
            lineCommissions.push({ discountedPrice, commission });
            sellerShareLines.set(entry.product.sellerId, [
              ...(sellerShareLines.get(entry.product.sellerId) ?? []),
              commission.shippingBuyerShares,
            ]);
          }
          const sellerShippingFeeDiscounts = new Map<
            string,
            AppliedFeeDiscount[]
          >();
          const sellerShippingDecision = new Map(
            await Promise.all(
              [...sellerLineSubtotals.entries()].map(
                async ([sellerId, subtotal]) => {
                  const decision = this.orderPricing.resolveShippingDecision({
                    tariff: shippingTariff.tariff,
                    subtotal,
                    billableDesi: sellerDesi.get(sellerId) ?? 1,
                    lineShares: sellerShareLines.get(sellerId) ?? [],
                    thresholdSubtotal:
                      sellerListSubtotals.get(sellerId) ?? subtotal,
                  });
                  const lead = pricing.find(
                    (entry) => entry.product.sellerId === sellerId,
                  );
                  const discounted = await this.feeDiscounts?.applyShipping({
                    context: {
                      productId: lead?.product.id ?? "",
                      categoryId: lead?.product.categoryId ?? null,
                      sellerId,
                      buyerId,
                      buyerTier,
                    },
                    buyerShippingAmount: decision.buyer,
                    sellerShippingAmount: decision.seller,
                    remainingAllowance: sellerAllowanceLeft.get(sellerId) ?? 0,
                    preloaded: feeCampaigns,
                    couponCandidates:
                      couponFeeCandidate &&
                      couponEligibleIds.has(lead?.product.id ?? "")
                        ? [couponFeeCandidate]
                        : [],
                  });
                  if (discounted?.applied.length) {
                    sellerShippingFeeDiscounts.set(
                      sellerId,
                      discounted.applied,
                    );
                  }
                  return [
                    sellerId,
                    {
                      ...decision,
                      buyer: discounted?.buyerShippingAmount ?? decision.buyer,
                      seller:
                        discounted?.sellerShippingAmount ?? decision.seller,
                    },
                  ] as const;
                },
              ),
            ),
          );

          const sellerShippingCharged = new Set<string>();
          // Per-seller shipping breakdown captured on the charged line, used to write
          // the OrderPackage with the SAME buyer-share semantics as direct/guest
          // (previously the group path stored the full undivided shipping here).
          const sellerShippingBreakdown = new Map<
            string,
            { full: number; buyer: number; seller: number }
          >();

          for (const [entryIndex, entry] of pricing.entries()) {
            // Satırın tahsil edilen ürün tabanı: komisyon, kargo, vergi ve alıcı
            // toplamı hep bunun üzerinden hesaplanır (adet>1 ölçeklenir).
            const { discountedPrice, commission: commissionResult } =
              lineCommissions[entryIndex];
            // Satıcı-bazlı kargo ücreti: yalnız satıcının İLK satırına yükle, kardeşlere 0.
            const entrySellerId = entry.product.sellerId;
            const decision = sellerShippingDecision.get(entrySellerId);
            let fullShipping = 0;
            let buyerShippingAmount = 0;
            let sellerShippingAmount = 0;
            let chargedThisLine = false;
            if (!sellerShippingCharged.has(entrySellerId)) {
              // Alıcı yalnız kendi payını öder; kalanı satıcı üstlenir.
              fullShipping = decision?.fullShipping ?? 0;
              buyerShippingAmount = decision?.buyer ?? 0;
              sellerShippingAmount = decision?.seller ?? 0;
              sellerShippingCharged.add(entrySellerId);
              chargedThisLine = true;
            }
            const shippingCost = buyerShippingAmount; // buyer-charged shipping
            if (chargedThisLine) {
              sellerShippingBreakdown.set(entrySellerId, {
                full: fullShipping,
                buyer: buyerShippingAmount,
                seller: sellerShippingAmount,
              });
            }
            const {
              taxAmount,
              withholdingTaxAmount,
              buyerServiceTaxAmount,
              sellerServiceTaxAmount,
              serviceVatRate,
            } = await this.checkoutCommon.resolveOrderTaxes({
              sellerId: entry.product.sellerId,
              categoryId: entry.product.categoryId,
              subtotal: discountedPrice,
              // Hizmet KDV matrahları: bu SATIRA düşen ücretler + kargo payı.
              // Kargo yalnız satıcının ilk satırına yüklendiği için koli başına
              // tek kez vergilenir.
              fees: {
                buyerCommissionAmount: commissionResult.buyerCommissionAmount,
                buyerServiceFeeAmount: commissionResult.buyerServiceFeeAmount,
                buyerShippingAmount,
                sellerCommissionAmount: commissionResult.sellerCommissionAmount,
                sellerPlatformFeeAmount:
                  commissionResult.sellerPlatformFeeAmount,
                sellerShippingAmount,
              },
            });
            // Alıcı: ürün + kargo payı + alıcı ücretleri + ürün KDV'si +
            // alıcıya verilen hizmetlerin KDV'si.
            const totalAmount = buyerTotalOf({
              subtotal: discountedPrice,
              buyerShippingAmount: shippingCost,
              buyerFeeAmount: commissionResult.buyerFeeAmount,
              buyerServiceTaxAmount,
            });
            const orderNumber = await this.checkoutCommon.generateOrderNumber();
            const suratIdempotencyKey =
              this.checkoutCommon.buildSuratIdempotencyKey([
                dto.idempotencyKey,
                entry.productId,
              ]);

            orderInputs.push({
              pricingEntry: entry,
              orderNumber,
              commissionResult,
              // `Order.subtotal` = tahsil edilen ürün tabanı. Tek yerde hesaplanıp
              // taşınır; create'te yeniden türetilseydi ikinci bir kaynak olurdu.
              subtotal: discountedPrice,
              shippingCost,
              fullShippingAmount: fullShipping,
              buyerShippingAmount,
              sellerShippingAmount,
              taxAmount,
              withholdingTaxAmount,
              buyerServiceTaxAmount,
              sellerServiceTaxAmount,
              serviceVatRate,
              totalAmount,
              suratIdempotencyKey,
              // Bu satıra düşen bedel indirimleri: satır kampanyaları + (kargo
              // yalnız satıcının ilk satırına yüklendiği için) kargo kampanyası.
              feeDiscountsApplied: [
                ...(lineFeeDiscounts[entryIndex] ?? []),
                ...(chargedThisLine
                  ? (sellerShippingFeeDiscounts.get(entrySellerId) ?? [])
                  : []),
              ],
            });
          }

          const groupTotalAmount = orderInputs.reduce(
            (sum, o) => sum + o.totalAmount,
            0,
          );

          const group = await tx.checkoutGroup.create({
            data: {
              groupNumber,
              buyerId,
              idempotencyKey: dto.idempotencyKey,
              totalAmount: groupTotalAmount,
              isGuest,
              // Onay damgası SUNUCUDA basılır: istemci yalnız "kabul ettim" der,
              // zamanı ve sözleşme sürümünü söyleyemez.
              ...distanceSalesConsent(dto.distanceSalesAccepted),
            },
          });

          // Satıcı başına OrderPackage (çatı): o satıcının order'ları + tek kargo ücreti.
          // shippingCost KANONİK olarak alıcı payıdır (direct/guest ile aynı) + tarife
          // snapshot'ı. Faz 2'de fiziksel Sürat gönderisi de bu paket başına konsolide olacak.
          const packageBySeller = new Map<string, string>();
          for (const [sellerId, decision] of sellerShippingDecision) {
            const bd = sellerShippingBreakdown.get(sellerId) ?? {
              full: decision.fullShipping,
              buyer: decision.buyer,
              seller: decision.seller,
            };
            const pkg = await tx.orderPackage.create({
              data: {
                packageNumber:
                  await this.checkoutCommon.generatePackageNumber(),
                checkoutGroupId: group.id,
                sellerId,
                buyerId,
                shippingCost: bd.buyer,
                shippingTariffId: shippingTariff.tariffId,
                shippingTariffVersion: shippingTariff.tariffVersion,
                billableDesi: sellerDesi.get(sellerId) ?? 1,
                shippingPricingSnapshot: {
                  provider: shippingTariff.tariff.provider ?? "surat",
                  tariffId: shippingTariff.tariffId,
                  tariffVersion: shippingTariff.tariffVersion,
                  billableDesi: sellerDesi.get(sellerId) ?? 1,
                  fullShippingAmount: bd.full,
                },
                fullShippingAmount: bd.full,
                buyerShippingAmount: bd.buyer,
                sellerShippingAmount: bd.seller,
              },
            });
            packageBySeller.set(sellerId, pkg.id);
          }

          const createdOrders: Array<{
            id: string;
            orderNumber: string;
            productId: string;
            totalAmount: number;
            subtotal: number;
            discountAmount: number;
            productTitle: string;
            sellerId: string;
            sellerEmail: string | null;
            sellerName: string | null;
          }> = [];

          for (const input of orderInputs) {
            const entry = input.pricingEntry;
            const totalDiscount =
              entry.productDiscount +
              entry.quantityDiscount +
              entry.couponDiscount;

            const shippingAddressJson: Record<string, unknown> = {
              id: shippingAddress.id,
              title: shippingAddress.title || "Teslimat Adresi",
              fullName: shippingAddress.fullName,
              phone: shippingAddress.phone,
              city: shippingAddress.city,
              district: shippingAddress.district,
              address: shippingAddress.address,
              zipCode: shippingAddress.zipCode,
            };
            if (isGuest && guest) {
              shippingAddressJson.guestName =
                guest.name || shippingAddress.fullName;
              shippingAddressJson.guestEmail = guest.email;
              shippingAddressJson.guestPhone = guest.phone;
              shippingAddressJson.isGuestOrder = true;
            }
            if (this.suratCargoService.isIntegrationEnabled()) {
              shippingAddressJson.suratIdempotencyKey =
                input.suratIdempotencyKey;
            }
            if (billingAddress !== shippingAddress) {
              (shippingAddressJson as any).billingAddress = {
                fullName: billingAddress.fullName,
                phone: billingAddress.phone,
                city: billingAddress.city,
                district: billingAddress.district,
                address: billingAddress.address,
                zipCode: billingAddress.zipCode,
              };
            }

            const order = await tx.order.create({
              data: {
                orderNumber: input.orderNumber,
                productId: entry.productId,
                buyerId,
                sellerId: entry.product.sellerId,
                checkoutGroupId: group.id,
                packageId: packageBySeller.get(entry.product.sellerId),
                quantity: entry.quantity,
                unitPrice: entry.productPrice,
                totalAmount: input.totalAmount,
                subtotal: input.subtotal,
                discountAmount: totalDiscount,
                discountCode:
                  entry.couponDiscount > 0 ? appliedCouponCode : null,
                discountBreakdown:
                  totalDiscount > 0
                    ? {
                        productDiscount: entry.productDiscount,
                        couponDiscount: entry.couponDiscount,
                        // Adet koşullu satıcı kampanyası (bogo/bulk_quantity):
                        // satıcının cebinden, satır bazında.
                        quantityDiscount: entry.quantityDiscount,
                        quantityCampaignId: entry.quantityCampaignId,
                        appliedDiscountId,
                        originalPrice: entry.originalPrice,
                      }
                    : undefined,
                platformFundedDiscount:
                  Math.round(
                    entry.couponDiscount * appliedPlatformFundedShare * 100,
                  ) / 100,
                shippingCost: input.shippingCost,
                taxAmount: input.taxAmount,
                withholdingTaxAmount: input.withholdingTaxAmount,
                buyerServiceTaxAmount: input.buyerServiceTaxAmount,
                sellerServiceTaxAmount: input.sellerServiceTaxAmount,
                serviceVatRate: input.serviceVatRate,
                commissionAmount: input.commissionResult.commissionAmount,
                buyerFeeAmount: input.commissionResult.buyerFeeAmount,
                sellerFeeAmount: input.commissionResult.sellerFeeAmount,
                buyerCommissionAmount:
                  input.commissionResult.buyerCommissionAmount,
                buyerServiceFeeAmount:
                  input.commissionResult.buyerServiceFeeAmount,
                sellerCommissionAmount:
                  input.commissionResult.sellerCommissionAmount,
                sellerPlatformFeeAmount:
                  input.commissionResult.sellerPlatformFeeAmount,
                buyerShippingAmount: input.buyerShippingAmount,
                sellerShippingAmount: input.sellerShippingAmount,
                buyerFeeDiscountAmount: (input.feeDiscountsApplied ?? [])
                  .filter((line) => line.side === "buyer")
                  .reduce((sum, line) => sum + line.amount, 0),
                sellerFeeDiscountAmount: (input.feeDiscountsApplied ?? [])
                  .filter((line) => line.side === "seller")
                  .reduce((sum, line) => sum + line.amount, 0),
                feeDiscountBreakdown: input.feeDiscountsApplied?.length
                  ? (input.feeDiscountsApplied as unknown as Prisma.InputJsonValue)
                  : undefined,
                financialSnapshot: this.checkoutCommon.buildFinancialSnapshot({
                  pricingHash: dto.expectedPricingHash,
                  productId: entry.productId,
                  quantity: entry.quantity,
                  unitPrice: entry.productPrice,
                  originalUnitPrice: entry.originalPrice,
                  subtotal: input.subtotal,
                  discountAmount: totalDiscount,
                  discountCode:
                    entry.couponDiscount > 0 ? appliedCouponCode : null,
                  platformFundedDiscount:
                    Math.round(
                      entry.couponDiscount * appliedPlatformFundedShare * 100,
                    ) / 100,
                  shipping: {
                    tariffId: shippingTariff.tariffId,
                    tariffVersion: shippingTariff.tariffVersion,
                    fullAmount: input.fullShippingAmount,
                    buyerAmount: input.buyerShippingAmount,
                    sellerAmount: input.sellerShippingAmount,
                  },
                  commission: input.commissionResult,
                  taxAmount: input.taxAmount,
                  withholdingTaxAmount: input.withholdingTaxAmount,
                  buyerServiceTaxAmount: input.buyerServiceTaxAmount,
                  sellerServiceTaxAmount: input.sellerServiceTaxAmount,
                  totalAmount: input.totalAmount,
                }),
                status: OrderStatus.pending_payment,
                paymentExpiresAt,
                shippingAddressId,
                shippingAddress: shippingAddressJson as Prisma.InputJsonValue,
              },
            });

            await this.checkoutCommon.recordCommissionSnapshot(
              order.id,
              input.orderNumber,
              input.commissionResult.commissionAmount,
              input.totalAmount,
              input.commissionResult,
            );

            // Kodsuz (otomatik) kampanyaların bütçesi sipariş oluşurken
            // harcanır; ödenmeyen sipariş kapanırken geri verilir. Kuponun
            // bütçesi aşağıdaki reserveUsage ile tutulur.
            await this.feeDiscounts?.spendBudgets(
              input.feeDiscountsApplied ?? null,
              tx,
            );

            await tx.product.update({
              where: { id: entry.productId },
              data: { reservedQuantity: { increment: entry.quantity } },
            });

            createdOrders.push({
              id: order.id,
              orderNumber: order.orderNumber,
              productId: entry.productId,
              totalAmount: input.totalAmount,
              subtotal: input.subtotal,
              discountAmount: totalDiscount,
              productTitle: entry.product.title,
              sellerId: entry.product.sellerId,
              sellerEmail: entry.product.seller?.email ?? null,
              sellerName: publicName(entry.product.seller),
            });
          }

          // Kupon kotası grup başına BİR KEZ tutulur. Gerçek kullanım ve usedCount
          // yalnız başarılı ödeme sonrasında PaymentFulfillmentService'te yazılır.
          if (appliedDiscountId) {
            const totalCouponDiscount = couponFeeCandidate
              ? orderInputs.reduce(
                  (sum, input) =>
                    sum +
                    (input.feeDiscountsApplied ?? [])
                      .filter((line) => line.discountId === appliedDiscountId)
                      .reduce((lineSum, line) => lineSum + line.amount, 0),
                  0,
                )
              : pricing.reduce((sum, p) => sum + p.couponDiscount, 0);
            if (totalCouponDiscount > 0 && createdOrders.length > 0) {
              await this.discountService.reserveUsage(
                appliedDiscountId,
                buyerId,
                createdOrders[0].id,
                totalCouponDiscount,
                appliedVoucherCodeId,
                paymentExpiresAt,
                tx,
              );
            }
          }

          // Sipariş(ler) oluşturuldu → alıcının sepetindeki bu ürünleri server-side kaldır.
          // Sepet eskiden yalnız client-side (ödeme başlatılınca) temizleniyordu; kullanıcı
          // ödemeye geçmeden iptal edince bayat sepet satırı kalıyor, "tekrar sipariş" akışını
          // bozuyordu. Misafirde server sepeti yoktur → deleteMany no-op (güvenli). cart.userId
          // ile kapsamlanır: yalnız BU alıcının satırları, yalnız sipariş edilen ürünler.
          if (!isGuest) {
            await tx.cartItem.deleteMany({
              where: {
                cart: { userId: buyerId },
                productId: { in: productIds },
              },
            });
          }

          return { group, createdOrders };
        },
        { timeout: 60000 },
      );
    } catch (error) {
      // Two concurrent requests with the same idempotencyKey: the unique
      // constraint on CheckoutGroup.idempotencyKey lets only one win; the loser
      // hits P2002. Return the winner's group as an idempotent replay instead of
      // surfacing a 500. For a guest, buyerId is the shared system-guest user, so
      // it must not scope the replay lookup — pass undefined.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replayed = await this.findCheckoutGroupReplay(
          dto.idempotencyKey,
          isGuest ? undefined : buyerId,
        );
        if (replayed) return replayed;
      }
      throw error;
    }

    // Cache invalidation + order.created eventleri (tx dışı; hata sipariş oluşumunu bozmaz)
    const buyerUser = isGuest
      ? null
      : await this.prisma.user.findUnique({
          where: { id: buyerId },
          select: { email: true, ...PUBLIC_NAME_SELECT },
        });

    for (const order of result.createdOrders) {
      await this.orderCommon.invalidateProductCaches(order.productId);
      try {
        await this.eventService.emitOrderCreated({
          orderId: order.id,
          orderNumber: order.orderNumber,
          buyerId,
          sellerId: order.sellerId,
          productId: order.productId,
          productTitle: order.productTitle,
          totalAmount: order.totalAmount,
          buyerEmail: isGuest ? guest?.email || "" : buyerUser?.email || "",
          buyerName: isGuest ? guest?.name || "Misafir" : publicName(buyerUser),
          sellerEmail: order.sellerEmail || "",
          sellerName: order.sellerName || "Satıcı",
        });
      } catch (error) {
        this.logger.error(`Failed to emit order.created event: ${error}`);
      }
    }

    return {
      checkoutGroupId: result.group.id,
      groupNumber: result.group.groupNumber,
      totalAmount: Number(result.group.totalAmount),
      orders: result.createdOrders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        productId: o.productId,
        totalAmount: o.totalAmount,
        subtotal: o.subtotal,
        discountAmount: o.discountAmount,
        appliedCouponCode:
          o.discountAmount > 0 ? (dto.couponCode ?? undefined) : undefined,
      })),
      provider: "paytr",
      paymentUrl: "",
    };
  }
}
