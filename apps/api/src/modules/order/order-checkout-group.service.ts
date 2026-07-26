import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CheckoutDto } from "./dto";
import { OrderStatus, ProductStatus, Prisma } from "@prisma/client";
import { getAvailableQuantity } from "../product/helpers/product-availability.helper";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { EventService } from "../events";
import { DiscountService } from "../discount";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { OrderPricingService, CommissionResult } from "./order-pricing.service";
import { OrderCommonService } from "./order-common.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";

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
          }

          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            include: {
              seller: { select: { id: true, email: true, displayName: true } },
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

          // Fiyatlandırma (ürün başına) — createDirectOrder ile aynı kurallar
          const now = new Date();
          const pricing = productIds.map((productId) => {
            const product = productMap.get(productId)!;
            const productPrice = Number(product.price);
            const isSaleActive =
              product.oldPrice != null &&
              (!product.saleStartDate ||
                now >= new Date(product.saleStartDate)) &&
              (!product.saleEndDate || now <= new Date(product.saleEndDate));
            const originalPrice =
              isSaleActive && product.oldPrice != null
                ? Number(product.oldPrice)
                : productPrice;
            return {
              productId,
              product,
              quantity: qtyByProduct.get(productId) ?? 1,
              productPrice,
              originalPrice,
              productDiscount: isSaleActive ? originalPrice - productPrice : 0,
              couponDiscount: 0,
            };
          });

          // Kupon: tüm sepetle bir kez doğrula, indirimi fiyat oranında dağıt
          let appliedCouponCode: string | null = null;
          let appliedDiscountId: string | null = null;
          let appliedVoucherCodeId: string | undefined;
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
              const totalCoupon = validation.discount.estimatedDiscount;
              // Kupon, satır toplamına (birim fiyat * adet) oranla dağıtılır.
              const priceSum = pricing.reduce(
                (sum, p) => sum + p.productPrice * p.quantity,
                0,
              );
              let allocated = 0;
              pricing.forEach((p, idx) => {
                if (idx === pricing.length - 1) {
                  p.couponDiscount =
                    Math.round((totalCoupon - allocated) * 100) / 100;
                } else {
                  p.couponDiscount =
                    Math.round(
                      ((totalCoupon * p.productPrice * p.quantity) / priceSum) *
                        100,
                    ) / 100;
                  allocated += p.couponDiscount;
                }
              });
            }
          }

          // Grup + sipariş numaraları
          const groupNumber = await generateUniqueReference(
            "GRP",
            async (code) =>
              (await this.prisma.checkoutGroup.count({
                where: { groupNumber: code },
              })) > 0,
          );

          const paymentExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const orderInputs: Array<{
            pricingEntry: (typeof pricing)[number];
            orderNumber: string;
            commissionResult: CommissionResult;
            shippingCost: number;
            taxAmount: number;
            withholdingTaxAmount: number;
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
          for (const entry of pricing) {
            const line =
              entry.productPrice * entry.quantity - entry.couponDiscount;
            sellerLineSubtotals.set(
              entry.product.sellerId,
              (sellerLineSubtotals.get(entry.product.sellerId) ?? 0) + line,
            );
          }
          // Satıcı-başına kargo: quote ile ORTAK yardımcı (DRY) → önizleme ve tahsilat
          // aynı; ikisi ayrı hesaplayınca oluşan az-göster/fazla-tahsil bug'ı kapandı.
          const sellerShipping =
            await this.orderPricing.calculateShippingBySeller(
              sellerLineSubtotals,
            );
          const sellerShippingCharged = new Set<string>();

          for (const entry of pricing) {
            // Satır toplamı = birim fiyat * adet - (satıra düşen kupon). Komisyon,
            // kargo ve vergi satır toplamı üzerinden hesaplanır (adet>1 ölçeklenir).
            const lineSubtotal = entry.productPrice * entry.quantity;
            const discountedPrice = lineSubtotal - entry.couponDiscount;
            const commissionResult =
              await this.orderPricing.calculateCommission(
                discountedPrice,
                entry.product.sellerId,
                entry.product.categoryId,
              );
            // Satıcı-bazlı kargo ücreti: yalnız satıcının İLK satırına yükle, kardeşlere 0.
            const entrySellerId = entry.product.sellerId;
            let shippingCost = 0;
            if (!sellerShippingCharged.has(entrySellerId)) {
              shippingCost = sellerShipping.get(entrySellerId) ?? 0;
              sellerShippingCharged.add(entrySellerId);
            }
            const { taxAmount, withholdingTaxAmount } =
              await this.checkoutCommon.resolveSellerTaxes(
                entry.product.sellerId,
                entry.product.categoryId,
                discountedPrice,
              );
            const totalAmount =
              discountedPrice +
              shippingCost +
              commissionResult.buyerFeeAmount +
              taxAmount;
            const orderNumber = await this.checkoutCommon.generateOrderNumber();
            const suratIdempotencyKey =
              this.checkoutCommon.buildSuratIdempotencyKey([
                dto.idempotencyKey,
                entry.productId,
              ]);

            // Sürat gönderisi sipariş satırlarından ÖNCE fail-fast: biri başarısızsa hiç sipariş oluşmaz
            await this.checkoutCommon.assertSuratShipmentSucceeded({
              correlationId: randomUUID(),
              idempotencyKey: suratIdempotencyKey,
              recipientFullName: shippingAddress.fullName,
              recipientPhone: shippingAddress.phone,
              recipientCity: shippingAddress.city,
              recipientDistrict: shippingAddress.district,
              recipientAddressLine: shippingAddress.address,
              productId: entry.productId,
              productTitle: entry.product.title ?? undefined,
              orderNumberPreview: orderNumber,
            });

            orderInputs.push({
              pricingEntry: entry,
              orderNumber,
              commissionResult,
              shippingCost,
              taxAmount,
              withholdingTaxAmount,
              totalAmount,
              suratIdempotencyKey,
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
            },
          });

          // Satıcı başına OrderPackage (çatı): o satıcının order'ları + tek kargo ücreti.
          // Faz 2'de fiziksel Sürat gönderisi de bu paket başına konsolide olacak.
          const packageBySeller = new Map<string, string>();
          for (const [sellerId, shipping] of sellerShipping) {
            const pkg = await tx.orderPackage.create({
              data: {
                checkoutGroupId: group.id,
                sellerId,
                buyerId,
                shippingCost: shipping,
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
            const totalDiscount = entry.productDiscount + entry.couponDiscount;

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
                subtotal: entry.originalPrice * entry.quantity,
                discountAmount: totalDiscount,
                discountCode:
                  entry.couponDiscount > 0 ? appliedCouponCode : null,
                discountBreakdown:
                  totalDiscount > 0
                    ? {
                        productDiscount: entry.productDiscount,
                        couponDiscount: entry.couponDiscount,
                        appliedDiscountId,
                        originalPrice: entry.originalPrice,
                      }
                    : undefined,
                shippingCost: input.shippingCost,
                taxAmount: input.taxAmount,
                withholdingTaxAmount: input.withholdingTaxAmount,
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
                buyerShippingAmount: input.shippingCost,
                sellerShippingAmount: 0,
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

            if (appliedDiscountId && entry.couponDiscount > 0) {
              await this.discountService.recordUsage(
                appliedDiscountId,
                buyerId,
                order.id,
                entry.couponDiscount,
                appliedVoucherCodeId,
              );
              // Voucher tek kullanımlık: grup içinde yalnızca İLK siparişte redeem
              // edilir; sonraki siparişlerde tekrar denenmez (aksi halde "zaten
              // kullanıldı" fırlatır).
              appliedVoucherCodeId = undefined;
            }

            await tx.product.update({
              where: { id: entry.productId },
              data: { reservedQuantity: { increment: entry.quantity } },
            });

            createdOrders.push({
              id: order.id,
              orderNumber: order.orderNumber,
              productId: entry.productId,
              totalAmount: input.totalAmount,
              subtotal: entry.originalPrice * entry.quantity,
              discountAmount: totalDiscount,
              productTitle: entry.product.title,
              sellerId: entry.product.sellerId,
              sellerEmail: entry.product.seller?.email ?? null,
              sellerName: entry.product.seller?.displayName ?? null,
            });
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
          select: { email: true, displayName: true },
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
          buyerName: isGuest
            ? guest?.name || "Misafir"
            : buyerUser?.displayName || buyerUser?.email || "",
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
