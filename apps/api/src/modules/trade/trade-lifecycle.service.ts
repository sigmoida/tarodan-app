import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  GoneException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { MembershipService } from "../membership/membership.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import {
  TradeStatus,
  ProductStatus,
  ShipmentStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  getAvailableQuantity,
  safeDecrementReserved,
} from "../product/helpers/product-availability.helper";
import {
  getProductStatusFromQuantity,
  getReservedAwareStatus,
} from "../product/helpers/product-status.helper";
import {
  computeTradeConfirmationDeadline,
  computeTradeHoldReleaseAt,
  startTradeConfirmationWindowIfDelivered,
} from "../../common/helpers/trade-escrow";
import { ACTIVE_TRADE_STATUSES, TRADE_PRICING_V2 } from "./trade.constants";
import { TRADE_VALID_TRANSITIONS } from "./trade.state-machine";
import { TradeQuoteService } from "./trade-quote.service";
import { buildTradeCashPaymentRows } from "./trade-payment-rows.helper";
import { buildTradeCommissionRuleSnapshot } from "./trade-commission-snapshot";
import { PaymentService } from "../payment/payment.service";
import { ProductLockService } from "../product/product-lock.service";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeCommonService } from "./trade-common.service";
import { TradeQueryService } from "./trade-query.service";
import { DiscountService } from "../discount/discount.service";
import {
  CreateTradeDto,
  AcceptTradeDto,
  RejectTradeDto,
  CounterTradeDto,
  CancelTradeDto,
  ShipTradeDto,
  ConfirmTradeReceiptDto,
  RaiseTradeDisputeDto,
  ResolveTradeDisputeDto,
  TradeResponseDto,
} from "./dto";
import { i18nMessage } from "../i18n";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import {
  generateReferenceCode,
  generateUniqueReference,
} from "../../common/helpers/generate-reference";
import { calculateServiceTax } from "../order/order-service-tax.helper";
import { OrderTaxPolicyService } from "../order/order-tax-policy.service";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

/**
 * Takas yaşam döngüsü metodları (create/accept/reject/counter/cancel/ship/
 * confirm/dispute) — TradeService'ten birebir taşındı (facade-delege deseni;
 * order split'teki OrderLifecycleService ile aynı düzen).
 */
@Injectable()
export class TradeLifecycleService {
  private readonly logger = new Logger(TradeLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Vergi politikası siparişlerle ORTAK — takas kendi oranını tutmaz.
    private readonly taxPolicy: OrderTaxPolicyService,
    private readonly membershipService: MembershipService,
    private readonly notificationService: NotificationService,
    private readonly paymentService: PaymentService,
    private readonly productLockService: ProductLockService,
    private readonly tradeShipment: TradeShipmentService,
    private readonly tradeCommon: TradeCommonService,
    private readonly tradeQuery: TradeQueryService,
    private readonly tradeQuote: TradeQuoteService,
    // Takas hizmet bedeli kampanyası (İ25) — yoksa takas indirimsiz akar.
    @Optional() private readonly discountService?: DiscountService,
  ) {}

  // ==========================================================================
  // TRADE STATE MACHINE
  // Valid transitions as per SYSTEM_OPERATIONS_GUIDE.md
  // ==========================================================================
  private readonly validTransitions = TRADE_VALID_TRANSITIONS;

  private canTransition(from: TradeStatus, to: TradeStatus): boolean {
    return this.validTransitions[from]?.includes(to) ?? false;
  }

  // ==========================================================================
  // TRADE NUMBER GENERATION
  // ==========================================================================
  /**
   * Takas referansı: TKS-XXXXXXXXXX. Önek "TRD" değildir — o, e-Arşiv fatura
   * numarasının GİB'e kayıtlı önekiyle çakışır (bkz. code-prefixes.ts).
   */
  private generateTradeNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.trade,
      async (code) =>
        (await this.prisma.trade.count({ where: { tradeNumber: code } })) > 0,
    );
  }

  // ==========================================================================
  // CREATE TRADE
  // ==========================================================================
  async createTrade(
    initiatorId: string,
    dto: CreateTradeDto,
  ): Promise<TradeResponseDto> {
    // Validate receiver exists and is not self
    if (initiatorId === dto.receiverId) {
      throw new BadRequestException(
        i18nMessage("server.trade.cannotTradeWithSelf"),
      );
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.receiverId },
    });

    if (!receiver) {
      throw new NotFoundException(i18nMessage("server.trade.receiverNotFound"));
    }

    const initiatorCanTrade =
      await this.membershipService.canCreateTrade(initiatorId);
    if (!initiatorCanTrade.allowed) {
      this.logger.warn("Trade create failed: initiator cannot trade");
      throw new BadRequestException(initiatorCanTrade.reason);
    }

    // ALICI da yetkili olmalı. Eskiden yalnız başlatan denetleniyordu; alıcının
    // yetkisi ancak KABUL anında bakılıyordu. Üyeliği biten bir satıcının
    // ilanları "takasa açık" kaldığı için teklif oluşturulabiliyor, alıcı
    // kabul edemiyor ve teklif yanıt süresi dolana dek askıda kalıyordu.
    const receiverCanTrade = await this.membershipService.canCreateTrade(
      dto.receiverId,
    );
    if (!receiverCanTrade.allowed) {
      throw new BadRequestException(
        i18nMessage("server.trade.receiverCannotTrade"),
      );
    }

    // Validate initiator owns the products (no isTradeEnabled check - user can offer any of their own items)
    const initiatorProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.initiatorItems.map((i) => i.productId) },
        sellerId: initiatorId,
        status: ProductStatus.active,
      },
    });

    if (initiatorProducts.length !== dto.initiatorItems.length) {
      throw new BadRequestException(
        i18nMessage("server.trade.someItemsNotOwnedOrInactive"),
      );
    }

    // Validate receiver's requested products
    const receiverProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.receiverItems.map((i) => i.productId) },
        sellerId: dto.receiverId,
        status: ProductStatus.active,
        isTradeEnabled: true,
      },
    });

    if (receiverProducts.length !== dto.receiverItems.length) {
      throw new BadRequestException(
        i18nMessage("server.trade.requestedItemsNotEligible"),
      );
    }

    // Only check initiator's offered products — same product can't be offered in multiple active trades.
    // Receiver's product can be the target of multiple offers; the receiver chooses which to accept.
    const initiatorProductIds = dto.initiatorItems.map((i) => i.productId);
    if (initiatorProductIds.length > 0) {
      const existingTradeItems = await this.prisma.tradeItem.findMany({
        where: {
          productId: { in: initiatorProductIds },
          side: "initiator",
          trade: { status: { in: ACTIVE_TRADE_STATUSES } },
        },
      });
      if (existingTradeItems.length > 0) {
        throw new BadRequestException(
          i18nMessage("server.trade.itemAlreadyInActiveTrade"),
        );
      }
    }

    // Validate stock: müsait adet (available) >= item.quantity
    const allProducts = [...initiatorProducts, ...receiverProducts];
    const allItems = [...dto.initiatorItems, ...dto.receiverItems];
    for (const item of allItems) {
      const product = allProducts.find((p) => p.id === item.productId);
      if (product) {
        const available = getAvailableQuantity(product);
        if (available !== null && available < item.quantity) {
          throw new BadRequestException(
            i18nMessage("server.trade.insufficientStockForItem", {
              title: product.title,
              available,
              requested: item.quantity,
            }),
          );
        }
      }
    }

    // Get trade deadlines from platform settings
    const responseHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_response_deadline_hours" },
    });
    const responseHours = parseInt(responseHoursSetting?.settingValue ?? "72");

    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + responseHours);

    // Calculate cash payer if there's a cash component
    let cashPayerId: string | null = null;
    if (dto.cashAmount && dto.cashAmount !== 0) {
      // Positive = initiator pays, negative = receiver pays
      cashPayerId = dto.cashAmount > 0 ? initiatorId : dto.receiverId;
    }

    // Teklifi başlatanın teslimat adresi (tx dışı okuma). Takas fiziksel gönderim
    // gerektirir; teklifi yapanın bir teslimat adresi OLMASI ZORUNLU (yoksa depo→
    // kullanıcı ayağında adres boş kalır, takas takılır). Ancak SEÇMESİ zorunlu
    // değil: varsayılan adresi varsa otomatik kullanılır. Hiç adresi yoksa net
    // hata → kullanıcı önce adres ekler (ön yüzdeki adres seçici bunu sağlar).
    const initiatorAddressId =
      await this.tradeShipment.resolveTradeShippingAddressId(
        initiatorId,
        dto.shippingAddressId,
        { required: true },
      );

    // Referans işlem dışında üretilir: çakışma kontrolü transaction'ı
    // gereksiz yere uzatmasın.
    const tradeNumber = await this.generateTradeNumber();

    // Create trade in transaction
    const trade = await this.prisma.$transaction(async (tx) => {
      // CRITICAL: Don't reserve products when trade is pending
      // Products should remain active and available for purchase
      // Only reserve when trade is accepted
      // Products will be marked as inactive/sold when trade is completed or product is purchased

      // Create trade
      const newTrade = await tx.trade.create({
        data: {
          tradeNumber,
          initiatorId,
          receiverId: dto.receiverId,
          status: TradeStatus.pending,
          cashAmount: dto.cashAmount ? Math.abs(dto.cashAmount) : null,
          cashPayerId,
          initiatorMessage: dto.message,
          initiatorAddressId,
          responseDeadline,
          // Yeni takaslar v2 fiyatlamasıyla açılır: iki taraf da sabit hizmet
          // bedeli + 2 bacak kargo öder. Devam eden v1 takaslar etkilenmez.
          pricingVersion: TRADE_PRICING_V2,
        },
        include: {
          initiator: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
      });

      // Create trade items for initiator
      await tx.tradeItem.createMany({
        data: dto.initiatorItems.map((item) => ({
          tradeId: newTrade.id,
          productId: item.productId,
          side: "initiator",
          quantity: item.quantity,
          valueAtTrade:
            initiatorProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });

      // Create trade items for receiver (what initiator wants)
      await tx.tradeItem.createMany({
        data: dto.receiverItems.map((item) => ({
          tradeId: newTrade.id,
          productId: item.productId,
          side: "receiver",
          quantity: item.quantity,
          valueAtTrade:
            receiverProducts.find((p) => p.id === item.productId)?.price ?? 0,
        })),
      });

      return newTrade;
    });

    // Send notification to receiver about new trade offer
    try {
      const initiator = await this.prisma.user.findUnique({
        where: { id: initiatorId },
        select: PUBLIC_NAME_SELECT,
      });

      await this.notificationService.createInAppNotification(
        dto.receiverId,
        NotificationType.TRADE_RECEIVED,
        {
          tradeId: trade.id,
          initiatorName: publicName(initiator),
        },
      );
    } catch (error) {
      this.logger.warn("Failed to send trade notification");
    }

    return this.tradeQuery.getTradeById(trade.id, initiatorId);
  }

  // ==========================================================================
  // ACCEPT TRADE
  // ==========================================================================
  async acceptTrade(
    tradeId: string,
    userId: string,
    dto: AcceptTradeDto,
  ): Promise<TradeResponseDto> {
    // Validate receiver membership before opening the transaction
    const receiverCanTrade =
      await this.membershipService.canCreateTrade(userId);
    if (!receiverCanTrade.allowed) {
      throw new BadRequestException(
        i18nMessage("server.trade.membershipExpiredForAccept"),
      );
    }

    // Get deadline settings (read-only, safe outside tx)
    const paymentHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_payment_deadline_hours" },
    });
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_shipping_deadline_days" },
    });

    const paymentHours = parseInt(paymentHoursSetting?.settingValue ?? "48");
    const shippingDays = parseInt(shippingDaysSetting?.settingValue ?? "7");

    let tradeInitiatorId: string;
    let acceptedNextStatus: TradeStatus | null = null;
    let receiverAddressId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      // Lock trade row first
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.receiverId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.trade.onlyReceiverCanAccept"),
        );
      }

      if (!this.canTransition(trade.status, TradeStatus.accepted)) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotAcceptInStatus", {
            status: trade.status,
          }),
        );
      }

      if (new Date() > trade.responseDeadline) {
        throw new BadRequestException(
          i18nMessage("server.trade.responseDeadlinePassed"),
        );
      }

      // Yetki/durum kontrolleri geçti → kabul edenin teslimat adresini ZORUNLU
      // olarak çöz (kargo kabulde başlar). Adres yoksa net hata. (Yetki
      // kontrollerinden SONRA: 403'ü adres hatasıyla maskelememek için.)
      receiverAddressId =
        await this.tradeShipment.resolveTradeShippingAddressId(
          userId,
          dto.shippingAddressId,
          { required: true, db: tx },
        );

      tradeInitiatorId = trade.initiatorId;

      // Teklif edenin (initiator) KULLANILABİLİR bir teslimat adresi olduğunu
      // doğrula (kargo etiketi adressiz basılamaz; aksi halde inbound shipment
      // oluşmaz ve takas at_warehouse'a geçemeden takılırdı). providedId olarak
      // BİLEREK undefined geçiyoruz: saklı initiatorAddressId bayat/foreign olsa
      // bile (ör. karşı teklif rol swap'ı sonrası) "size ait değil" fırlatmak
      // YERİNE varsayılan→en eski adrese fallback ederiz — tıpkı gerçek kargo
      // çözücü (resolveSideAddress) gibi. Yalnızca initiator'ın HİÇ adresi yoksa
      // required:true ile net hata. Bu sadece bir doğrulamadır; kargonun gideceği
      // adresi resolveSideAddress bağımsız olarak (saklı id + kendi fallback'i)
      // belirler, dolayısıyla burada undefined vermek kargo adresini değiştirmez.
      await this.tradeShipment.resolveTradeShippingAddressId(
        trade.initiatorId,
        undefined,
        { required: true, db: tx },
      );

      const now = new Date();
      const paymentDeadline = new Date(now);
      paymentDeadline.setHours(paymentDeadline.getHours() + paymentHours);
      const shippingDeadline = new Date(now);
      shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

      const tradeItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      // Lock every product row involved and verify availability
      const byProduct = new Map<string, number>();
      for (const item of tradeItems) {
        byProduct.set(
          item.productId,
          (byProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }

      // Takas kabul: her iki taraf için reservedQuantity++ (FOR UPDATE pessimistic lock).
      // #3 (DEADLOCK FIX): ürünleri id-SIRALI kilitle → iki takas ortak ürünleri farklı
      // sırada kilitleyip birbirini bekleyemez (tutarlı kilit sırası; grup-checkout deseni).
      const sortedProductIds = [...byProduct.keys()].sort();
      for (const productId of sortedProductIds) {
        await this.productLockService.checkAndReserve(
          tx,
          productId,
          byProduct.get(productId)!,
        );
      }

      // Safe-trade stock cascade: if this trade depleted the last available
      // unit, cancel OTHER pending offers, trades, and pending_payment orders.
      for (const productId of byProduct.keys()) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { quantity: true, reservedQuantity: true },
        });
        if (!product || product.quantity === null) continue;
        const available =
          (product.quantity ?? 0) - (product.reservedQuantity ?? 0);
        if (available <= 0) {
          const reason = "Stok takas icin ayrildi";
          // Müsait adet bittiyse ürünü 'reserved' yap: status=active filtreleri
          // (liste/arama/öne çıkanlar) ve detay (findOne) artık gizler, başka
          // kullanıcı göremez/satın alamaz. Takas iptal/red/iade/tamamlanınca
          // ilgili yollar status'u tekrar active'e (ya da sold/inactive) çevirir.
          await tx.product.update({
            where: { id: productId },
            data: { status: ProductStatus.reserved },
          });
          await this.productLockService.invalidateRelatedOffers(tx, productId);
          await this.productLockService.invalidateRelatedTrades(
            tx,
            productId,
            tradeId, // exclude the current trade
          );
          await this.productLockService.invalidatePendingOrdersForProduct(
            tx,
            productId,
            reason,
          );
        }
      }

      // Safe-trade status routing:
      //   - cash trade  -> awaiting_payment (cash must be paid before shipping)
      //   - non-cash    -> shipping_to_warehouse (both ship to Tarodan warehouse)
      // v2: iki taraf da ödeyeceği için kafa kafaya takas da ödeme bekler.
      // v1: yalnız nakit farkı olan takas ödeme bekler (eski davranış korunur).
      const isV2 = trade.pricingVersion === TRADE_PRICING_V2;
      const quote = isV2 ? await this.tradeQuote.quoteForTrade(tradeId) : null;
      const nextStatus =
        isV2 || (trade.cashPayerId && trade.cashAmount)
          ? TradeStatus.awaiting_payment
          : TradeStatus.shipping_to_warehouse;
      acceptedNextStatus = nextStatus;

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: nextStatus,
          receiverMessage: dto.message,
          receiverAddressId,
          acceptedAt: now,
          paymentDeadline: isV2 || trade.cashPayerId ? paymentDeadline : null,
          // shippingDeadline only set when shipping begins (either immediately
          // for non-cash, or after successful payment for cash trades)
          shippingDeadline:
            nextStatus === TradeStatus.shipping_to_warehouse
              ? shippingDeadline
              : null,
          commissionRuleSnapshot: quote
            ? buildTradeCommissionRuleSnapshot(quote)
            : undefined,
          version: { increment: 1 },
        },
      });

      // Non-cash takas kabul edildi → depo etiketleri + Sürat sevkiyatı tx SONRASI
      // tek kaynaktan (createInboundTradeShipments) yapılır. Burada ayrıca etiket
      // oluşturmuyoruz; aksi halde inbound fonksiyon "zaten var" deyip Sürat'a
      // göndermeyi atlıyordu (her iki tarafın etiketi yine oluşur, BUG B korunur).

      if (isV2) {
        // v2: iki taraf da öder. Tutarlar teklif servisinden gelir ve BURADA
        // snapshot'lanır — kural/tarife sonradan değişse bile kabul edilmiş
        // takasın fiyatı sabittir (siparişteki komisyon snapshot'ıyla aynı ilke).
        // Ekranların gösterdiği teklif ile tahsil edilen tutar aynı kaynaktan
        // gelir, bu yüzden ayrışamaz.
        if (quote) {
          // İ25: takas hizmet bedeli kampanyası kabul anında çözülür ve fiyat
          // snapshot'ıyla birlikte dondurulur; bütçesi de burada harcanır.
          // Kampanya çözülemezse takas indirimsiz akar; ticaret durmaz.
          let feeDiscounts = new Map<
            string,
            { discountId: string; name: string; amount: number }
          >();
          try {
            feeDiscounts =
              (await this.discountService?.resolveTradeFeeDiscounts([
                {
                  userId: quote.initiator.userId,
                  feeAmount: quote.initiator.serviceFee,
                },
                {
                  userId: quote.receiver.userId,
                  feeAmount: quote.receiver.serviceFee,
                },
              ])) ?? feeDiscounts;
          } catch (error) {
            this.logger.warn(
              `takas hizmet bedeli kampanyası çözülemedi (${tradeId}): ${error}`,
            );
          }
          await tx.tradeCashPayment.createMany({
            data: buildTradeCashPaymentRows(tradeId, quote, feeDiscounts),
          });
          const budgetEntries = [...feeDiscounts.values()].map((won) => ({
            discountId: won.discountId,
            amount: won.amount,
          }));
          if (budgetEntries.length) {
            await this.discountService?.spendTradeFeeBudget(budgetEntries, tx);
          }
        }
      } else if (trade.cashAmount && trade.cashPayerId) {
        // v1 (LEGACY): yalnız farkı ödeyen taraftan, farkın yüzdesi kadar
        // aracılık komisyonu. Devam eden takaslar bu yolla biter; yeni takaslar
        // v2 damgalı olduğu için buraya HİÇ girmez.
        const rateRow = await tx.platformSetting.findUnique({
          where: { settingKey: "trade_commission_rate" },
        });
        const ratePct = Number(rateRow?.settingValue ?? "5") || 5;
        const commission =
          Math.round(trade.cashAmount.toNumber() * (ratePct / 100) * 100) / 100;
        const taxPolicy = await this.taxPolicy.resolve();
        const { sellerServiceTaxAmount: commissionTaxAmount } =
          calculateServiceTax(
            {
              buyerCommissionAmount: 0,
              buyerServiceFeeAmount: 0,
              buyerShippingAmount: 0,
              sellerCommissionAmount: commission,
              sellerPlatformFeeAmount: 0,
              sellerShippingAmount: 0,
            },
            this.taxPolicy.effectiveServiceVatRate(taxPolicy),
          );
        await tx.tradeCashPayment.create({
          data: {
            tradeId,
            payerId: trade.cashPayerId,
            recipientId:
              trade.cashPayerId === trade.initiatorId
                ? trade.receiverId
                : trade.initiatorId,
            amount: trade.cashAmount,
            commission,
            commissionTaxAmount,
            totalAmount:
              Math.round(
                (trade.cashAmount.toNumber() +
                  commission +
                  commissionTaxAmount) *
                  100,
              ) / 100,
            provider: "pending",
            status: PaymentStatus.pending,
          },
        });
      }
    });

    await this.tradeCommon.invalidateProductCachesForTrade(tradeId);

    try {
      await this.notificationService.createInAppNotification(
        tradeInitiatorId!,
        NotificationType.TRADE_ACCEPTED,
        { tradeId },
      );
    } catch (error) {
      this.logger.warn("Failed to send trade accepted notification");
    }

    // Non-cash safe-trade: trade is already shipping_to_warehouse, so we
    // auto-create both inbound TradeShipment rows + dispatch them to Sürat.
    // Cash trades stay in awaiting_payment here; their inbound shipments are
    // created by PaymentService after a successful cash payment.
    if (acceptedNextStatus === TradeStatus.shipping_to_warehouse) {
      // Fire-and-forget; the helper never throws.
      this.tradeShipment.createInboundTradeShipments(tradeId).catch((err) => {
        this.logger.error(
          `createInboundTradeShipments crashed for ${tradeId}: ${err?.message ?? err}`,
        );
      });
    }

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // REJECT TRADE
  // ==========================================================================
  async rejectTrade(
    tradeId: string,
    userId: string,
    dto: RejectTradeDto,
  ): Promise<TradeResponseDto> {
    let tradeInitiatorId: string;

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.receiverId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.trade.onlyReceiverCanReject"),
        );
      }

      if (!this.canTransition(trade.status, TradeStatus.rejected)) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotRejectInStatus", {
            status: trade.status,
          }),
        );
      }

      tradeInitiatorId = trade.initiatorId;

      // Restore stock only if trade was accepted (pending trades have none decremented)
      if (trade.status === TradeStatus.accepted) {
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        if (allItems.length > 0) {
          const byProduct = new Map<string, number>();
          for (const item of allItems) {
            byProduct.set(
              item.productId,
              (byProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }
          // #4: DEADLOCK-güvenli SIRALI FOR UPDATE + clamp'li release. Eskiden ürün
          // kilitlenmeden oku-hesapla-mutlak-yaz yapılıyordu → araya giren bir checkout
          // rezervasyonu siliniyordu (lost-update). releaseReservation ürünü kilitler.
          for (const productId of [...byProduct.keys()].sort()) {
            await this.productLockService.releaseReservation(
              tx,
              productId,
              byProduct.get(productId)!,
            );
          }
        }
      }

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.rejected,
          cancelReason: dto.reason,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
    });

    await this.tradeCommon.invalidateProductCachesForTrade(tradeId);

    try {
      await this.notificationService.createInAppNotification(
        tradeInitiatorId!,
        NotificationType.TRADE_REJECTED,
        { tradeId },
      );
    } catch (error) {
      this.logger.warn("Failed to send trade rejected notification");
    }

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // COUNTER TRADE OFFER
  // ==========================================================================
  async counterTrade(
    tradeId: string,
    userId: string,
    dto: CounterTradeDto,
  ): Promise<TradeResponseDto> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: true,
      },
    });

    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }

    // Store version for optimistic locking
    const tradeVersion = trade.version;

    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }

    // Only receiver can send counter-offer
    if (trade.receiverId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.trade.onlyReceiverCanCounter"),
      );
    }

    // Trade must be in pending status
    if (trade.status !== TradeStatus.pending) {
      throw new BadRequestException(
        i18nMessage("server.trade.cannotCounterInStatus", {
          status: trade.status,
        }),
      );
    }

    // Check response deadline hasn't expired
    if (new Date() > trade.responseDeadline) {
      throw new BadRequestException(
        i18nMessage("server.trade.responseDeadlinePassed"),
      );
    }

    // Validate user has premium membership
    const userCanTrade = await this.membershipService.canCreateTrade(userId);
    if (!userCanTrade.allowed) {
      throw new BadRequestException(
        i18nMessage("server.trade.membershipRequiredForCounter"),
      );
    }

    // Karşı teklifin muhatabı da yetkili olmalı — aksi halde kabul edemeyeceği
    // bir teklif üretilir (bkz. createTrade'deki aynı kapı).
    const originalInitiatorCanTrade =
      await this.membershipService.canCreateTrade(trade.initiatorId);
    if (!originalInitiatorCanTrade.allowed) {
      throw new BadRequestException(
        i18nMessage("server.trade.receiverCannotTrade"),
      );
    }

    // Get original initiator (who will become the receiver)
    const originalInitiatorId = trade.initiatorId;
    const originalReceiverId = trade.receiverId; // current user (counter-offerer)

    // Get current trade item IDs for comparison
    const currentInitiatorItemIds = (trade.items || [])
      .filter((i: { side: string }) => i.side === "initiator")
      .map((item: { productId: string }) => item.productId)
      .sort();
    const currentReceiverItemIds = (trade.items || [])
      .filter((i: { side: string }) => i.side === "receiver")
      .map((item: { productId: string }) => item.productId)
      .sort();

    // Check for identical counter-offer
    const newInitiatorItemIds = dto.initiatorItems
      .map((i) => i.productId)
      .sort();
    const newReceiverItemIds = dto.receiverItems.map((i) => i.productId).sort();
    const newCashAmount = Math.abs(dto.cashAmount || 0);
    const currentCashAmount = Math.abs(trade.cashAmount?.toNumber() || 0);

    // Nakit YÖNÜNÜ de karşılaştır: sadece "kim öder"i çevirmek (ben→o) gerçek bir değişikliktir.
    // Math.abs yön bilgisini sildiği için, ödeyen tarafı ayrıca kıyaslıyoruz.
    const newCashPayerId =
      dto.cashAmount && dto.cashAmount !== 0
        ? dto.cashAmount > 0
          ? originalReceiverId
          : originalInitiatorId
        : null;
    const currentCashPayerId = trade.cashPayerId ?? null;

    const isIdentical =
      JSON.stringify(newInitiatorItemIds) ===
        JSON.stringify(currentReceiverItemIds) &&
      JSON.stringify(newReceiverItemIds) ===
        JSON.stringify(currentInitiatorItemIds) &&
      newCashAmount === currentCashAmount &&
      newCashPayerId === currentCashPayerId;

    if (isIdentical) {
      throw new BadRequestException(
        i18nMessage("server.trade.counterOfferIdenticalToPrevious"),
      );
    }

    // Validate counter-offerer owns the products they're offering
    // Allow active OR reserved (if in current trade)
    const counterOffererProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.initiatorItems.map((i) => i.productId) },
        sellerId: originalReceiverId, // current receiver is offering these
        OR: [
          { status: ProductStatus.active },
          {
            status: ProductStatus.reserved,
            id: { in: currentReceiverItemIds }, // Only allow if in current trade
          },
        ],
      },
    });

    if (counterOffererProducts.length !== dto.initiatorItems.length) {
      throw new BadRequestException(
        i18nMessage("server.trade.someItemsNotOwnedOrInactive"),
      );
    }

    // Validate original initiator's products (what counter-offerer wants)
    // Allow active AND trade-enabled OR reserved (if in current trade)
    const originalInitiatorProducts = await this.prisma.product.findMany({
      where: {
        id: { in: dto.receiverItems.map((i) => i.productId) },
        sellerId: originalInitiatorId, // original initiator owns these
        OR: [
          {
            status: ProductStatus.active,
            isTradeEnabled: true,
          },
          {
            status: ProductStatus.reserved,
            id: { in: currentInitiatorItemIds }, // Only allow if in current trade
          },
        ],
      },
    });

    if (originalInitiatorProducts.length !== dto.receiverItems.length) {
      throw new BadRequestException(
        i18nMessage("server.trade.requestedItemsNotEligible"),
      );
    }

    // Adet bazlı: karşı teklifteki ürünlerde yeterli müsait adet olmalı
    for (const item of dto.initiatorItems) {
      const product = counterOffererProducts.find(
        (p) => p.id === item.productId,
      );
      if (product) {
        const available = getAvailableQuantity(product);
        if (available !== null && available < item.quantity) {
          throw new BadRequestException(
            i18nMessage("server.trade.insufficientStockForItem", {
              title: product.title,
              available,
              requested: item.quantity,
            }),
          );
        }
      }
    }

    // Get trade deadlines from platform settings
    const responseHoursSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "trade_response_deadline_hours" },
    });
    const responseHours = parseInt(responseHoursSetting?.settingValue ?? "72");

    const responseDeadline = new Date();
    responseDeadline.setHours(responseDeadline.getHours() + responseHours);

    // Calculate cash payer if there's a cash component
    // After swap: originalReceiverId becomes initiator, originalInitiatorId becomes receiver
    let cashPayerId: string | null = null;
    if (dto.cashAmount && dto.cashAmount !== 0) {
      // Positive = new initiator (originalReceiverId) pays, negative = new receiver (originalInitiatorId) pays
      cashPayerId =
        dto.cashAmount > 0 ? originalReceiverId : originalInitiatorId;
    }

    const oldItems = await this.prisma.tradeItem.findMany({
      where: { tradeId },
    });
    const oldProductIds = [...new Set(oldItems.map((i) => i.productId))];

    // Rol swap'ı sonrası karşı-teklifçi (originalReceiverId) YENİ initiator olur.
    // initiatorAddressId eski initiator'ın adresinde kalırsa "bayat" (foreign)
    // kalır; veri hijyeni için yeni initiator'ın adresini çözüp yazıyoruz. Ancak
    // required:false — counter modal'ında adres seçici olmadığından, adresi
    // olmayan karşı-teklifçiyi burada BLOKLAMIYORUZ (çıkmaz olurdu). Adresi varsa
    // yazılır, yoksa null kalır; eksik adres durumu accept aşamasındaki guard ve
    // kargo çözücünün fallback'i ile ele alınır. CounterTradeDto adres almaz.
    const newInitiatorAddressId =
      await this.tradeShipment.resolveTradeShippingAddressId(
        originalReceiverId,
        undefined,
        { required: false },
      );

    // Update trade in transaction
    // Not: Counter offer sadece pending trade'de yapılır. Pending'de quantity
    // düşürülmemiştir, dolayısıyla burada stok manipülasyonu gerekmez.
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeItem.deleteMany({
        where: { tradeId },
      });

      // Swap roles: originalReceiverId becomes initiator, originalInitiatorId becomes receiver
      // Update trade with swapped roles
      await tx.trade.update({
        where: { id: tradeId, version: tradeVersion },
        data: {
          initiatorId: originalReceiverId, // Swapped
          receiverId: originalInitiatorId, // Swapped
          initiatorAddressId: newInitiatorAddressId, // Yeni initiator'ın adresi (swap ile güncellenmeli)
          cashAmount: dto.cashAmount ? Math.abs(dto.cashAmount) : null,
          cashPayerId,
          initiatorMessage: dto.message, // New initiator's message
          receiverMessage: null, // Clear old receiver message
          responseDeadline,
          version: { increment: 1 },
        },
      });

      // Create new trade items for new initiator (originalReceiverId)
      await tx.tradeItem.createMany({
        data: dto.initiatorItems.map((item) => ({
          tradeId,
          productId: item.productId,
          side: "initiator",
          quantity: item.quantity,
          valueAtTrade:
            counterOffererProducts.find((p) => p.id === item.productId)
              ?.price ?? 0,
        })),
      });

      // Create new trade items for new receiver (originalInitiatorId) - what counter-offerer wants
      await tx.tradeItem.createMany({
        data: dto.receiverItems.map((item) => ({
          tradeId,
          productId: item.productId,
          side: "receiver",
          quantity: item.quantity,
          valueAtTrade:
            originalInitiatorProducts.find((p) => p.id === item.productId)
              ?.price ?? 0,
        })),
      });
    });

    const newProductIds = [
      ...new Set([
        ...dto.initiatorItems.map((i) => i.productId),
        ...dto.receiverItems.map((i) => i.productId),
      ]),
    ];
    await this.tradeCommon.invalidateProductCaches([
      ...oldProductIds,
      ...newProductIds,
    ]);

    // Send notification to original initiator about counter offer
    try {
      const counterOfferer = await this.prisma.user.findUnique({
        where: { id: originalReceiverId },
        select: PUBLIC_NAME_SELECT,
      });

      await this.notificationService.createInAppNotification(
        originalInitiatorId, // Original initiator receives the counter offer notification
        NotificationType.TRADE_COUNTER,
        {
          tradeId,
          counterOffererName: publicName(counterOfferer),
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to send counter trade notification: ${error}`);
    }

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // CANCEL TRADE
  // ==========================================================================
  async cancelTrade(
    tradeId: string,
    userId: string,
    dto: CancelTradeDto,
  ): Promise<TradeResponseDto> {
    let alreadyCancelled = false;
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.initiatorId !== userId && trade.receiverId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.trade.notAuthorizedToCancel"),
        );
      }

      // Idempotent: second cancel after the first already succeeded returns the
      // existing trade instead of failing on the transition guard.
      if (trade.status === TradeStatus.cancelled) {
        alreadyCancelled = true;
        return;
      }

      if (!this.canTransition(trade.status, TradeStatus.cancelled)) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotCancelInStatus", {
            status: trade.status,
          }),
        );
      }

      // Legacy flow: after both shipped can't cancel
      if (
        trade.status === TradeStatus.both_shipped ||
        trade.status === TradeStatus.initiator_received ||
        trade.status === TradeStatus.receiver_received
      ) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotCancelAfterBothShipped"),
        );
      }

      // Safe-trade flow: once items reach warehouse, only admin can intervene
      if (
        trade.status === TradeStatus.at_warehouse ||
        trade.status === TradeStatus.admin_reviewing ||
        trade.status === TradeStatus.shipping_to_recipients ||
        trade.status === TradeStatus.returning
      ) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotCancelAfterWarehouseArrival"),
        );
      }

      // Kullanıcı kuralı: ürün KARGOYA VERİLDİKTEN sonra takas iptal edilemez
      // (ne iptal ne iade). shipping_to_warehouse'da taraflardan biri kendi
      // to_warehouse gönderisini kargoya verdiyse (shippedAt) ya da depoya
      // ulaştıysa (firstWarehouseArrivalAt) kullanıcı artık iptal edemez; bu
      // noktadan sonra yalnızca admin müdahale eder (force-cancel-stuck/reject).
      if (trade.status === TradeStatus.shipping_to_warehouse) {
        const handedToCargo = await tx.tradeShipment.findFirst({
          where: { tradeId, leg: "to_warehouse", shippedAt: { not: null } },
          select: { id: true },
        });
        if (handedToCargo || trade.firstWarehouseArrivalAt !== null) {
          throw new BadRequestException(
            i18nMessage("server.trade.cannotCancelAfterShippedToCargo"),
          );
        }
      }

      // Restore stock only for accepted+ trades (pending have nothing decremented)
      const hasReservation = trade.status !== TradeStatus.pending;
      if (hasReservation) {
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        const byProduct = new Map<string, number>();
        for (const item of allItems) {
          byProduct.set(
            item.productId,
            (byProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
        // #4: DEADLOCK-güvenli SIRALI FOR UPDATE + clamp'li release (bkz. releaseReservation).
        for (const productId of [...byProduct.keys()].sort()) {
          await this.productLockService.releaseReservation(
            tx,
            productId,
            byProduct.get(productId)!,
          );
        }
      }

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.cancelled,
          cancelReason: dto.reason,
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });

      // KUSUR: vazgeçen taraf iptali başlattı; KARŞI taraf üstüne düşeni
      // yapmıştı. Onun ödemesi hizmet bedeli ve kargo dahil TAM iade edilir
      // (bkz. trade-refund-policy). Karar satıra yazılır — iade sağlayıcıda
      // patlarsa retry cron'u da aynı tutarı hesaplar.
      const otherPartyId =
        trade.initiatorId === userId ? trade.receiverId : trade.initiatorId;
      await tx.tradeCashPayment.updateMany({
        where: { tradeId, payerId: otherPartyId },
        data: { fullRefundEntitled: true },
      });
    });

    if (!alreadyCancelled) {
      // MONEY-H2: iade FAILURE-TRACKING ile yapılır. Takas TX içinde zaten cancelled
      // commit edildi; iade PayTR'da patlarsa iptali geri alamayız — bunun yerine
      // refundTradeCashTracked, trade.refundFailureReason marker'ını yazar ki admin
      // retryTradeRefund + retryFailedTradeRefunds cron'u parayı toparlasın (yoksa
      // eski davranışta throw kullanıcıya 500 döner ve iade sessizce takılırdı).
      await this.paymentService.refundTradeCashTracked(tradeId);

      // Cancel Sürat shipments if any (e.g. trades cancelled after admin approval)
      await this.tradeShipment.cancelSuratShipmentsForTrade(tradeId);

      await this.tradeCommon.invalidateProductCachesForTrade(tradeId);
    }

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // SHIP TRADE (DEPRECATED — legacy eşler-arası akışın kargo ucu)
  //
  // Depo-escrow akışında hiçbir takas `accepted` durumunda kalmaz: kabul
  // doğrudan `awaiting_payment` ya da `shipping_to_warehouse` üretir ve iki
  // `to_warehouse` gönderisi sistem tarafından oluşturulur. Bu uç yalnız
  // legacy satırlar için ulaşılabilirdi; onlar da kargolama son tarihinde
  // otomatik iptal ediliyor. Açık bırakmak, `leg`/`recipientType` alanları
  // olmadan TradeShipment üreten canlı bir yol demekti — depo akışının
  // varsaydığı veri şeklini bozabilirdi. `ship-to-warehouse` ile aynı şekilde
  // 410 Gone döner.
  // ==========================================================================
  async shipTrade(
    tradeId: string,
    userId: string,
    _dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    this.logger.warn(
      `Deprecated shipTrade called by user=${userId} trade=${tradeId}; safe-trade flow creates both inbound shipments automatically`,
    );
    throw new GoneException(
      i18nMessage("server.trade.shipToWarehouseDeprecated"),
    );
  }

  // ==========================================================================
  // SHIP TO WAREHOUSE (DEPRECATED — auto-flow runs in createInboundTradeShipments)
  //
  // The user-driven form (address + carrier + tracking) is no longer the path
  // by which inbound TradeShipment rows are created. After a trade is accepted
  // (or, for cash trades, after payment succeeds), the backend auto-creates
  // both `to_warehouse` shipments and dispatches them to Sürat. This route
  // remains for backward compatibility with cached frontends and returns 410
  // Gone so callers stop trying to create duplicate shipments.
  // ==========================================================================
  async shipToWarehouse(
    tradeId: string,
    userId: string,
    _dto: ShipTradeDto,
  ): Promise<TradeResponseDto> {
    this.logger.warn(
      `Deprecated shipToWarehouse called by user=${userId} trade=${tradeId}; auto-flow handles inbound shipments now`,
    );
    throw new GoneException(
      i18nMessage("server.trade.shipToWarehouseDeprecated"),
    );
  }

  // ==========================================================================
  // CONFIRM RECEIPT
  // ==========================================================================
  async confirmReceipt(
    tradeId: string,
    userId: string,
    dto: ConfirmTradeReceiptDto,
  ): Promise<TradeResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      const isInitiator = trade.initiatorId === userId;
      const isReceiver = trade.receiverId === userId;

      if (!isInitiator && !isReceiver) {
        throw new ForbiddenException(
          i18nMessage("server.trade.notAuthorizedForAction"),
        );
      }

      const canConfirmStatuses: TradeStatus[] = [
        // Legacy peer-to-peer flow
        TradeStatus.both_shipped,
        TradeStatus.initiator_received,
        TradeStatus.receiver_received,
        // Safe-trade flow: user confirms the from_warehouse shipment to them
        TradeStatus.shipping_to_recipients,
      ];

      if (!canConfirmStatuses.includes(trade.status)) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotConfirmInStatus", {
            status: trade.status,
          }),
        );
      }

      // Locate the shipment to confirm
      let shipment;
      if (trade.status === TradeStatus.shipping_to_recipients) {
        // Safe-trade: find the from_warehouse shipment addressed to this user
        shipment = await tx.tradeShipment.findFirst({
          where: {
            tradeId,
            leg: "from_warehouse",
            recipientUserId: userId,
          },
        });
      } else {
        // Legacy: find the shipment from the other party
        const otherPartyId = isInitiator ? trade.receiverId : trade.initiatorId;
        shipment = await tx.tradeShipment.findFirst({
          where: { tradeId, shipperId: otherPartyId },
        });
      }

      if (!shipment) {
        throw new BadRequestException(
          i18nMessage("server.trade.noShipmentToConfirm"),
        );
      }
      if (shipment.confirmedAt) {
        throw new BadRequestException(
          i18nMessage("server.trade.shipmentAlreadyConfirmed"),
        );
      }

      // Süre dolduysa onay REDDEDİLMEZ. Pencere geçtiğinde takas zaten
      // otomatik tamamlanacaktır (autoConfirmExpiredReceipts, 5 dk'da bir);
      // aradaki boşlukta "onayla" diyen kullanıcıya hata göstermek, sonucu
      // değiştirmeyen bir engeldi. Süre dolduktan sonra onay, cron'un yapacağı
      // işi kullanıcının kendi eliyle yapmasıdır — para akışı aynıdır.
      // Legacy (depo dışı) akışta pencere kargoya verilişten sayıldığı için
      // eski katı kural orada da gereksizdi.

      let newStatus: TradeStatus;
      if (trade.status === TradeStatus.shipping_to_recipients) {
        // Safe-trade: if the OTHER from_warehouse shipment is also confirmed,
        // trade is completed. Otherwise stay in shipping_to_recipients.
        const otherShipment = await tx.tradeShipment.findFirst({
          where: {
            tradeId,
            leg: "from_warehouse",
            NOT: { id: shipment.id },
          },
        });
        newStatus =
          otherShipment && otherShipment.confirmedAt
            ? TradeStatus.completed
            : TradeStatus.shipping_to_recipients;
      } else if (trade.status === TradeStatus.both_shipped) {
        newStatus = isInitiator
          ? TradeStatus.initiator_received
          : TradeStatus.receiver_received;
      } else if (
        (trade.status === TradeStatus.initiator_received && isReceiver) ||
        (trade.status === TradeStatus.receiver_received && isInitiator)
      ) {
        newStatus = TradeStatus.completed;
      } else {
        throw new BadRequestException(
          i18nMessage("server.trade.invalidConfirmationStatus"),
        );
      }

      await tx.tradeShipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.delivered,
          // Onay penceresi bacakların max(deliveredAt)'inden hesaplandığı için
          // taşıyıcının yazdığı GERÇEK teslim tarihi kullanıcı onayı anıyla
          // EZİLMEZ — ezmek pencereyi (ve escrow release'ini) geç kaydırırdı.
          ...(shipment.deliveredAt ? {} : { deliveredAt: new Date() }),
          confirmedAt: new Date(),
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: newStatus,
          completedAt: newStatus === TradeStatus.completed ? new Date() : null,
          version: { increment: 1 },
        },
      });

      if (newStatus === TradeStatus.completed) {
        // Takas tamamlandı: quantity-- + reservedQuantity-- (her iki tarafın ürünü için)
        const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
        // #2 (LOST-UPDATE FIX): ürün satırlarını OKUMADAN ÖNCE FOR UPDATE ile kilitle
        // (decrementForOrder ile aynı desen) → eşzamanlı satış/takas düşümü stale mutlak-set
        // yazamaz (lost-update kapanır). id-SIRALI kilitle → çoklu-ürün deadlock önlenir.
        const lockIds = [...new Set(allItems.map((i) => i.productId))].sort();
        for (const pid of lockIds) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${pid} FOR UPDATE`;
        }
        const products = await tx.product.findMany({
          where: { id: { in: allItems.map((i) => i.productId) } },
        });

        const qtyByProduct = new Map<string, number>();
        for (const item of allItems) {
          qtyByProduct.set(
            item.productId,
            (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }

        for (const product of products) {
          const tradedQty = qtyByProduct.get(product.id) ?? 1;
          let newQuantity: number | null;

          if (product.quantity !== null && product.quantity > 0) {
            newQuantity = Math.max(0, product.quantity - tradedQty);
          } else if (product.quantity === null) {
            newQuantity = null;
          } else {
            newQuantity = 0;
          }

          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(
              product.reservedQuantity,
              tradedQty,
            ),
          };
          if (product.quantity !== null && product.quantity > 0) {
            updateData.quantity = newQuantity;
          }

          await tx.product.update({
            where: { id: product.id },
            data: updateData,
          });
        }

        const cashPayment = await tx.tradeCashPayment.findFirst({
          where: { tradeId },
        });
        if (cashPayment && cashPayment.status === PaymentStatus.completed) {
          // Safe-trade escrow: nakit hemen açılmaz, hold penceresi kadar
          // beklenir (süre ayardan — trade-escrow helper'ı tek kaynak).
          await tx.tradeCashPayment.updateMany({
            where: { tradeId },
            data: { holdReleaseAt: await computeTradeHoldReleaseAt(tx) },
          });
        }
      } else if (trade.status === TradeStatus.shipping_to_recipients) {
        // Bu bacak teslim/onay aldı ama karşı bacak henüz kapanmadı. Diğer koli
        // Sürat takibinde çoktan teslim edilmiş olabilir: iki bacak da teslimse
        // onay/itiraz penceresini ŞİMDİ başlat (idempotent).
        await startTradeConfirmationWindowIfDelivered(tx, tradeId);
      }
    });

    await this.tradeCommon.invalidateProductCachesForTrade(tradeId);

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // RAISE DISPUTE
  // ==========================================================================
  async raiseDispute(
    tradeId: string,
    userId: string,
    dto: RaiseTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.initiatorId !== userId && trade.receiverId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.trade.notAuthorizedForAction"),
        );
      }

      const existingDispute = await tx.tradeDispute.findUnique({
        where: { tradeId },
      });
      if (existingDispute) {
        throw new BadRequestException(
          i18nMessage("server.trade.disputeAlreadyOpen"),
        );
      }

      const canDisputeStatuses: TradeStatus[] = [
        TradeStatus.both_shipped,
        TradeStatus.initiator_received,
        TradeStatus.receiver_received,
        // Safe-trade: once admin has shipped from warehouse, the only recourse
        // is a dispute (item lost/damaged in transit, counterpart never
        // received, etc.).
        TradeStatus.shipping_to_recipients,
      ];

      if (!canDisputeStatuses.includes(trade.status)) {
        throw new BadRequestException(
          i18nMessage("server.trade.cannotDisputeInStatus", {
            status: trade.status,
          }),
        );
      }

      await tx.tradeDispute.create({
        data: {
          tradeId,
          raisedById: userId,
          reason: dto.reason,
          description: dto.description,
          evidence: dto.evidenceUrls || [],
        },
      });

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.disputed,
          version: { increment: 1 },
        },
      });
    });

    return this.tradeQuery.getTradeById(tradeId, userId);
  }

  // ==========================================================================
  // RESOLVE DISPUTE (Admin only)
  // ==========================================================================
  async resolveDispute(
    tradeId: string,
    adminId: string,
    dto: ResolveTradeDisputeDto,
  ): Promise<TradeResponseDto> {
    // İtiraz yalnız 2. kargo sonrası açılabildiği için hiçbir çözüm takası
    // geri saramaz: ürünler sahiplerinde kalır ve takas TAMAMLANIR.
    // compensate_* mağdur tarafın KENDİ ödemesini iade eder (kargo hariç —
    // trade-refund-policy matrisi) ve ek tazminatı ops'a işaretler; admin
    // tazminatı out-of-band kapatır (CompensationPanel).
    const compensationUserIdResolver:
      ((trade: { initiatorId: string; receiverId: string }) => string) | null =
      dto.resolution === "compensate_initiator"
        ? (t) => t.initiatorId
        : dto.resolution === "compensate_receiver"
          ? (t) => t.receiverId
          : null;

    const compensateBoth = dto.resolution === "compensate_both";

    let resolvedTradeInitiatorId: string;

    if (compensationUserIdResolver || compensateBoth) {
      // MONEY-M5: İadeden ÖNCE trade'in GERÇEKTEN `disputed` olduğunu doğrula.
      // Eskiden iade tx doğrulamasından ÖNCE yapılıyordu → trade disputed
      // DEĞİLSE (zaten çözülmüş / yanlış statü) tx guard'ı sonradan patlıyor
      // ama PARA ÇOKTAN İADE edilmiş oluyordu. Bu pre-check read-only;
      // aşağıdaki tx'in kilitli guard'ı atomik garantiyi korumaya devam eder
      // (refundTradeCashTracked'in kendi guard'ları da ikinci katman).
      const current = await this.prisma.trade.findUnique({
        where: { id: tradeId },
        select: { status: true, initiatorId: true, receiverId: true },
      });
      if (!current || current.status !== TradeStatus.disputed) {
        throw new BadRequestException(
          i18nMessage("server.trade.tradeNotInDisputeStatus"),
        );
      }
      // MONEY-H2: iade FAILURE-TRACKING ile (marker + retry cron).
      // compensate_X: yalnız mağdur tarafın ödeme satırı iade edilir (nakit
      // fark; hizmet bedeli/kargo kesilir) — karşı tarafın satırı escrow
      // takvimiyle serbest kalır. compensate_both (iki taraf da mağdur, ör.
      // her iki depo-çıkış kolisi de kayıp): İKİ satır da TAM iade edilir —
      // müşteri taahhüdü "hizmet bedeli ve kargo dahil" olduğu için satırlar
      // iadeden önce fullRefundEntitled ile damgalanır; retry cron'u da aynı
      // tutarı hesaplar. Trade hâlâ disputed olduğu için kapsamsız çağrı
      // serbesttir.
      if (compensateBoth) {
        await this.prisma.tradeCashPayment.updateMany({
          where: {
            tradeId,
            status: PaymentStatus.completed,
            releasedAt: null,
            refundedAt: null,
          },
          data: { fullRefundEntitled: true },
        });
      }
      await this.paymentService.refundTradeCashTracked(
        tradeId,
        compensateBoth
          ? undefined
          : { payerId: compensationUserIdResolver!(current) },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const trade = await this.getTradeWithLock(tradeId, tx);

      if (trade.status !== TradeStatus.disputed) {
        throw new BadRequestException(
          i18nMessage("server.trade.tradeNotInDisputeStatus"),
        );
      }

      const dispute = await tx.tradeDispute.findUnique({
        where: { tradeId },
      });
      if (!dispute) {
        throw new NotFoundException(
          i18nMessage("server.trade.disputeNotFound"),
        );
      }

      resolvedTradeInitiatorId = trade.initiatorId;

      await tx.tradeDispute.update({
        where: { tradeId },
        data: {
          resolution: dto.resolution,
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolutionNotes: dto.notes,
        },
      });

      const compensationUserId = compensationUserIdResolver
        ? compensationUserIdResolver(trade)
        : null;

      await tx.trade.update({
        where: { id: tradeId, version: trade.version },
        data: {
          status: TradeStatus.completed,
          completedAt: new Date(),
          ...(compensationUserId
            ? {
                compensationPendingUserId: compensationUserId,
                compensationResolvedAt: null,
              }
            : {}),
          version: { increment: 1 },
        },
      });

      const allItems = await tx.tradeItem.findMany({ where: { tradeId } });
      const qtyByProduct = new Map<string, number>();
      for (const item of allItems) {
        qtyByProduct.set(
          item.productId,
          (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }

      // Takas tamamlandı: quantity-- + reservedQuantity--
      // #2 (LOST-UPDATE FIX): okumadan ÖNCE ürünleri FOR UPDATE ile (id-sıralı) kilitle →
      // eşzamanlı satış/takas düşümü stale mutlak-set yazamaz; deadlock önlenir.
      const lockIds = [...new Set(allItems.map((i) => i.productId))].sort();
      for (const pid of lockIds) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${pid} FOR UPDATE`;
      }
      const products = await tx.product.findMany({
        where: { id: { in: allItems.map((i) => i.productId) } },
      });
      for (const product of products) {
        const tradedQty = qtyByProduct.get(product.id) ?? 1;
        let newQuantity: number | null;
        if (product.quantity !== null && product.quantity > 0) {
          newQuantity = Math.max(0, product.quantity - tradedQty);
        } else if (product.quantity === null) {
          newQuantity = null;
        } else {
          newQuantity = 0;
        }
        const updateData: any = {
          status: getProductStatusFromQuantity(newQuantity),
          reservedQuantity: safeDecrementReserved(
            product.reservedQuantity,
            tradedQty,
          ),
        };
        if (product.quantity !== null && product.quantity > 0) {
          updateData.quantity = newQuantity;
        }
        await tx.product.update({
          where: { id: product.id },
          data: updateData,
        });
      }

      // Escrow: itiraz çözümü confirmReceipt'ten geçmediği için holdReleaseAt
      // burada damgalanır; damgalanmazsa release cron'u satırları hiç serbest
      // bırakmaz ve payout'lar sonsuza dek askıda kalır. Tazmin edilen tarafın
      // satırı DIŞARIDA tutulur: iadesi başarıldıysa refundedAt zaten dışlar,
      // başarısız olduysa retry cron'u tamamlayana kadar released edilmemelidir.
      // Bu damga aynı zamanda completed-takas iade guard'ının niyet işaretidir:
      // damgasız satır = hâlâ iade borcu olan satır (payment-refund.service).
      // compensate_both'ta HİÇBİR satır damgalanmaz — ikisi de iade borcudur.
      if (!compensateBoth) {
        const holdReleaseAt = await computeTradeHoldReleaseAt(tx);
        await tx.tradeCashPayment.updateMany({
          where: {
            tradeId,
            status: PaymentStatus.completed,
            releasedAt: null,
            refundedAt: null,
            ...(compensationUserId
              ? { payerId: { not: compensationUserId } }
              : {}),
          },
          data: { holdReleaseAt },
        });
      }
    });

    await this.tradeCommon.invalidateProductCachesForTrade(tradeId);

    return this.tradeQuery.getTradeById(tradeId, resolvedTradeInitiatorId!);
  }

  /**
   * Acquire FOR UPDATE lock on the trade row.
   * When called with a Prisma transaction client the lock is held until
   * the transaction commits/rolls-back, providing real pessimistic locking.
   * Falls back to the root PrismaService when no tx is supplied (legacy callers).
   */
  private async getTradeWithLock(
    tradeId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    await client.$queryRaw`
      SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE
    `;

    const trade = await client.trade.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }

    return trade;
  }
}
