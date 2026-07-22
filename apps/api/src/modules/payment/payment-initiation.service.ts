import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { InitiatePaymentDto, PaymentProvider, DirectPaymentDto } from "./dto";
import {
  PaymentStatus,
  OrderStatus,
  TradeStatus,
  SavedCardStatus,
  Prisma,
} from "@prisma/client";
import { PayTRBuyer } from "../payment-providers/paytr.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { ProductLockService } from "../product/product-lock.service";
import { Request } from "express";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { i18nMessage } from "../i18n";

@Injectable()
export class PaymentInitiationService {
  private readonly logger = new Logger(PaymentInitiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly productLockService: ProductLockService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    private readonly paymentLifecycle: PaymentLifecycleService,
  ) {}

  /**
   * Get client IP address from request
   */
  private getClientIp(req?: Request): string {
    if (!req) {
      return "127.0.0.1";
    }

    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(",")[0].trim();
    }

    // Check for real IP header
    const realIp = req.headers["x-real-ip"];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to connection remote address
    return req.ip || req.socket?.remoteAddress || "127.0.0.1";
  }

  /**
   * Unified payment initiation for both authenticated and guest users
   * POST /payments/initiate
   */
  async initiatePaymentUnified(
    userId: string | null,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    // Grup ödemesi: tek ödeme checkout grubundaki tüm siparişleri kapsar
    if (dto.checkoutGroupId) {
      return this.initiateGroupPayment(userId, dto, req);
    }

    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        buyer: true,
        seller: true,
        product: true,
      },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.payment.orderNotFound"));
    }

    // Check if this is a guest order
    const shippingAddress = order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      // Authenticated user - must be the buyer
      if (order.buyerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.payment.cannotPayForOrder"),
        );
      }
    } else {
      // Guest user - order must be a guest order
      if (!isGuestOrder) {
        throw new ForbiddenException(
          i18nMessage("server.payment.loginRequiredForOrder"),
        );
      }
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException(
        i18nMessage("server.payment.orderNotAwaitingPayment"),
      );
    }

    // 24h kill-switch: defense in depth in case the cron hasn't run yet.
    if (
      order.paymentExpiresAt &&
      order.paymentExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        i18nMessage("server.payment.paymentWindowExpired"),
      );
    }

    return this.processPaymentInitiation(order, dto, req);
  }

  /**
   * Grup ödemesi başlatma: checkout grubundaki TÜM siparişler tek ödemeyle ödenir.
   * Tüm siparişler pending_payment olmalı; biri iptal olduysa grup ödenemez
   * (tutar grubun tamamı olduğundan kısmi tahsilat yapılamaz).
   */
  private async initiateGroupPayment(
    userId: string | null,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: dto.checkoutGroupId },
      include: {
        orders: {
          include: { buyer: true, seller: true, product: true },
        },
      },
    });

    if (!group || group.orders.length === 0) {
      throw new NotFoundException(
        i18nMessage("server.payment.orderGroupNotFound"),
      );
    }

    // Erişim kontrolü
    if (userId) {
      if (group.buyerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.payment.cannotPayForOrderGroup"),
        );
      }
    } else if (!group.isGuest) {
      throw new ForbiddenException(
        i18nMessage("server.payment.loginRequiredForOrder"),
      );
    }

    const now = Date.now();
    for (const order of group.orders) {
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          i18nMessage("server.payment.groupOrderItemNotAwaitingPayment", {
            item: order.product?.title ?? order.orderNumber,
          }),
        );
      }
      if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < now) {
        throw new BadRequestException(
          i18nMessage("server.payment.paymentWindowExpired"),
        );
      }
    }

    return this.processGroupPaymentInitiation(group, dto, req);
  }

  /**
   * Grup ödemesi ortak başlatma mantığı (processPaymentInitiation'ın grup karşılığı).
   * Tek Payment satırı checkoutGroupId üzerinden yeniden kullanılır; PayTR'ye
   * groupNumber merchant_oid + sipariş başına basket item ile gidilir.
   */
  private async processGroupPaymentInitiation(
    group: any,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";
    const totalAmount = Number(group.totalAmount);

    // 30-dk cron rezervasyonları bıraktıysa sipariş başına CAS ile yeniden al
    for (const order of group.orders) {
      if (order.reservationReleasedAt) {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, reservationReleasedAt: { not: null } },
            data: { reservationReleasedAt: null },
          });
          if (claimed.count === 0) return; // eşzamanlı retry kazandı
          await this.productLockService.checkAndReserve(tx, order.productId, 1);
        });
        this.logger.log(
          `Re-reserved 1 unit for group order ${order.id} after release (retry)`,
        );
      }
    }

    // checkout_group_id UNIQUE: grup için tek Payment. Var olanı yeniden kullan
    // (PayTR iframe token'ları tek kullanımlık → her denemede sıfırla).
    const existingPayment = await this.prisma.payment.findUnique({
      where: { checkoutGroupId: group.id },
    });

    let payment;
    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderGroupAlreadyPaid"),
        );
      }
      // FLOW-M1: CAS reset. findUnique ile bu güncelleme arasında bir başarı
      // callback'i ödemeyi `completed` yapmış olabilir; KOŞULSUZ update bunu
      // `pending`'e EZER (ödenmiş grup bozulur, çekilen para sipariş'e bağlı kalmaz).
      // Yalnız completed OLMAYAN satırı resetle; count===0 → arada tamamlandı.
      const reset = await this.prisma.payment.updateMany({
        where: {
          id: existingPayment.id,
          status: { not: PaymentStatus.completed },
        },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
          amount: totalAmount,
          provider: PaymentProvider.paytr,
        },
      });
      if (reset.count === 0) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderGroupAlreadyPaid"),
        );
      }
      payment = await this.prisma.payment.findUniqueOrThrow({
        where: { id: existingPayment.id },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          checkoutGroupId: group.id,
          amount: totalAmount,
          currency: "TRY",
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    await this.paymentCommon.logPaymentAction(
      "created",
      payment.id,
      undefined,
      undefined,
      undefined,
      PaymentStatus.pending,
      {
        amount: totalAmount,
        provider: PaymentProvider.paytr,
        checkoutGroupId: group.id,
        groupNumber: group.groupNumber,
        orderIds: group.orders.map((o: any) => o.id),
        buyerId: group.buyerId,
      },
    );

    if (bypassEnabled) {
      this.logger.warn(
        `PAYMENT_BYPASS active: group payment ${payment.id} ready for bypass completion`,
      );
      return {
        paymentId: payment.id,
        checkoutGroupId: group.id,
        orderId: group.orders[0]?.id,
        amount: totalAmount,
        provider: PaymentProvider.paytr,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
    await this.paymentCommon.assignMerchantOid(
      payment.id,
      String(group.groupNumber || group.id),
    );
    return {
      paymentId: payment.id,
      checkoutGroupId: group.id,
      amount: totalAmount,
      provider: PaymentProvider.paytr,
      expiresIn: 300,
    };
  }

  /**
   * Initiate payment for an order (legacy - for backward compatibility)
   */
  async initiatePayment(
    buyerId: string,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    return this.initiatePaymentUnified(buyerId, dto, req);
  }

  /**
   * Initiate payment for a guest order (legacy - for backward compatibility)
   */
  async initiateGuestPayment(dto: InitiatePaymentDto, req?: Request) {
    return this.initiatePaymentUnified(null, dto, req);
  }

  /**
   * PayTR Direct API ile kart ödemesi — TÜM kullanıcılar için TEK ödeme yolu.
   * (iframe kaldırıldı; misafir + üye aynı site-içi kart formundan öder.)
   *
   * Güvenlik:
   * - Kart no/CVV YALNIZCA bu istekte PayTR'a iletilir; DB'ye/log'a ASLA yazılmaz.
   * - Yeni kart 3D Secure ile (non3d=false). Yanıt 3DS HTML'i; kesin sonuç callback ile işlenir.
   * - storeCard yalnız giriş yapmış kullanıcı + PAYTR_RECURRING_ENABLED açıkken (Non3D yetkisi).
   *
   * Hedef: orderId (satın alma/üyelik/tekliften order) | checkoutGroupId (sepet) | tradeId (takas
   * nakit farkı). Kart: (a) yeni kart → 3D/CIT (createDirectPayment, storeCard ile saklanabilir)
   * VEYA (b) kayıtlı kart → Non3D recurring servisi (chargeRecurring; require_cvv ise CVV ile).
   *
   * Kayıtlı kart (Flow B) + kart saklama, PayTR'nin Non3D/Tekrarlayan Ödeme yetkisine bağlıdır;
   * PAYTR_RECURRING_ENABLED arkasındadır. Yetki gelene kadar yalnız yeni-kart 3D yolu canlıdır.
   */
  async processDirectPayment(
    userId: string | null,
    dto: DirectPaymentDto,
    req?: Request,
  ) {
    if (!dto.card && !dto.savedCardId) {
      throw new BadRequestException(
        i18nMessage("server.payment.cardOrSavedCardRequired"),
      );
    }

    const recurringEnabled =
      this.configService.get("PAYTR_RECURRING_ENABLED") === "true";

    // Kayıtlı kart yalnız giriş yapmış kullanıcıya aittir.
    if (dto.savedCardId && !userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.loginRequiredForSavedCard"),
      );
    }
    // Kayıtlı kartla ödeme PayTR Non3D yetkisine bağlı → flag kapalıyken kullanılamaz.
    if (dto.savedCardId && !recurringEnabled) {
      throw new GoneException(
        i18nMessage("server.payment.savedCardPaymentUnavailable"),
      );
    }

    // Hedefi (sipariş / grup / takas) çöz; ortak Payment + buyer + sepet + merchant_oid hazırlanır.
    // resolveDirectPaymentContext payment'ı atomik olarak `processing`'e CLAIM eder (H2).
    const {
      payment,
      buyer,
      basketItems,
      merchantOid,
      amount,
      successQueryParams,
    } = await this.resolveDirectPaymentContext(userId, dto, req);

    try {
      return await this.chargeDirectPayment(
        dto,
        {
          payment,
          buyer,
          basketItems,
          merchantOid,
          amount,
          successQueryParams,
        },
        userId,
      );
    } finally {
      // H2: çekim tamamlandı — `processing` claim'ini bırak, `pending`'e döndür ki
      // async PayTR callback ödemeyi tamamlayabilsin (CAS `pending` bekler). Yalnız
      // hâlâ `processing` ise dokun: bu sırada hızlı callback completed yaptıysa ezme.
      await this.prisma.payment
        .updateMany({
          where: { id: payment.id, status: PaymentStatus.processing },
          data: { status: PaymentStatus.pending },
        })
        .catch(() => undefined);
    }
  }

  /**
   * processDirectPayment'ın çekim gövdesi. `processing`'e claim edilmiş payment
   * üzerinde PayTR çekimini yapar (yeni kart 3D / kayıtlı kart recurring).
   * Claim bırakma (processing→pending) çağıran processDirectPayment'ın finally'sinde.
   */
  private async chargeDirectPayment(
    dto: DirectPaymentDto,
    ctx: {
      payment: any;
      buyer: PayTRBuyer;
      basketItems: Array<{
        id: string;
        name: string;
        category: string;
        price: number;
        quantity: number;
      }>;
      merchantOid: string;
      amount: number;
      successQueryParams: string;
    },
    userId: string | null,
  ) {
    const {
      payment,
      buyer,
      basketItems,
      merchantOid,
      amount,
      successQueryParams,
    } = ctx;
    const recurringEnabled =
      this.configService.get("PAYTR_RECURRING_ENABLED") === "true";

    // Flow B — KAYITLI KARTLA ÖDEME: PayTR'da kayıtlı kartla ödeme Non3D recurring servisiyle
    // yapılır (chargeRecurring). Kart sahibi kullanıcı olmalı; require_cvv ise CVV zorunlu.
    // Sonuç callback ile kesinleşir (success/wait_callback) — sipariş/escrow ortak yoldan akar.
    if (dto.savedCardId) {
      const saved = await this.prisma.savedCard.findFirst({
        where: {
          id: dto.savedCardId,
          userId: userId as string,
          status: SavedCardStatus.active,
        },
      });
      if (!saved)
        throw new NotFoundException(
          i18nMessage("server.payment.savedCardNotFound"),
        );
      if (saved.requireCvv && !dto.cvv) {
        throw new BadRequestException(
          i18nMessage("server.payment.cvvRequiredForCard"),
        );
      }
      const r = await this.paymentProviders.resolve().chargeRecurring({
        utoken: saved.utoken,
        ctoken: saved.ctoken,
        amount,
        merchantOid,
        buyer,
        basketItems,
        cvv: dto.cvv,
      });
      if (r.status === "failed") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { failureReason: r.reason || "Kayıtlı kartla ödeme başarısız" },
        });
      }
      return {
        paymentId: payment.id,
        threeDSHtml: null,
        status: r.status,
        reason: r.reason ?? null,
      };
    }

    // Flow A — YENİ KART (CIT): 3D ile (non3d=false). storeCard yalnız giriş yapmış kullanıcı +
    // Non3D yetkisi (PAYTR_RECURRING_ENABLED) açıkken; aksi halde saklanan kart kullanılamaz.
    if (!dto.card)
      throw new BadRequestException(
        i18nMessage("server.payment.cardInfoRequired"),
      );
    const storeCard = !!dto.saveCard && !!userId && recurringEnabled;
    const result = await this.paymentProviders.resolve().createDirectPayment(
      merchantOid,
      amount,
      {
        number: dto.card.cardNumber,
        expireMonth: dto.card.expireMonth,
        expireYear: dto.card.expireYear,
        cvv: dto.card.cvc,
        holderName: dto.card.cardHolderName,
      },
      buyer,
      basketItems,
      { non3d: false, storeCard, successQueryParams },
    );

    return {
      paymentId: payment.id,
      threeDSHtml: (result as any).threeDSHtml ?? null,
      status: "pending" as const,
    };
  }

  /**
   * Direct API ödeme hedefini çöz: tekil sipariş / grup (sepet) / takas nakit farkı.
   * Ortak Payment satırını bul/oluştur, providerConversationId=merchant_oid yaz, buyer + sepet +
   * tutar + successQueryParams hazırla. iframe akışlarına DOKUNMADAN onların doğrulama mantığını
   * (sahiplik, durum, süre) taklit eder. Sonuç tüm kart yolları (yeni/kayıtlı) için ortaktır.
   */
  private async resolveDirectPaymentContext(
    userId: string | null,
    dto: DirectPaymentDto,
    req?: Request,
  ): Promise<{
    payment: any;
    buyer: PayTRBuyer;
    basketItems: Array<{
      id: string;
      name: string;
      category: string;
      price: number;
      quantity: number;
    }>;
    merchantOid: string;
    amount: number;
    successQueryParams: string;
  }> {
    const clientIp = this.getClientIp(req);
    const buildBuyer = (u: any, shippingAddress?: any): PayTRBuyer => {
      const sa = shippingAddress || {};
      // Misafir siparişinde PayTR'a GERÇEK misafir bilgisini gönder (alıcı = sistem-misafir
      // placeholder'ı 'guest@tarodan.system' DEĞİL). Üye siparişinde hesabın bilgisi kullanılır.
      const isGuest = sa.isGuestOrder === true;
      const fullName: string = String(
        (isGuest ? sa.fullName || sa.guestName : u?.displayName) ||
          u?.displayName ||
          "Müşteri",
      ).trim();
      const parts = fullName.split(/\s+/);
      return {
        name: parts[0] || "Müşteri",
        surname: parts.slice(1).join(" ") || parts[0] || "Müşteri",
        email: (isGuest ? sa.guestEmail : u?.email) || u?.email,
        phone: sa.phone || sa.guestPhone || u?.phone || "+905000000000",
        ip: clientIp,
        address: sa.address || sa.fullAddress || "Türkiye",
        city: sa.city || "İstanbul",
        country: "Türkiye",
      };
    };

    let payment: any;
    let buyer: PayTRBuyer;
    let basketItems: Array<{
      id: string;
      name: string;
      category: string;
      price: number;
      quantity: number;
    }>;
    let baseOid: string;
    let amount: number;
    let successQueryParams: string;

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        include: { buyer: true, seller: true, product: true },
      });
      if (!order)
        throw new NotFoundException(
          i18nMessage("server.payment.orderNotFound"),
        );
      // Sahiplik: üye → alıcı olmalı; misafir → sipariş misafir siparişi olmalı (iframe ile aynı kural).
      const isGuestOrder =
        (order.shippingAddress as any)?.isGuestOrder === true;
      if (userId) {
        if (order.buyerId !== userId)
          throw new ForbiddenException(
            i18nMessage("server.payment.cannotPayForOrder"),
          );
      } else if (!isGuestOrder) {
        throw new ForbiddenException(
          i18nMessage("server.payment.loginRequiredForOrder"),
        );
      }
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderNotAwaitingPayment"),
        );
      }
      if (
        order.paymentExpiresAt &&
        order.paymentExpiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException(
          i18nMessage("server.payment.paymentWindowExpired"),
        );
      }
      // 30-dk cron rezervasyonu bıraktıysa charge öncesi CAS ile geri al (oversell koruması;
      // iframe initiate yolundaki ile aynı kural — Direct tek yol olunca burada da şart).
      if (order.reservationReleasedAt) {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, reservationReleasedAt: { not: null } },
            data: { reservationReleasedAt: null },
          });
          if (claimed.count === 0) return; // eşzamanlı retry kazandı
          await this.productLockService.checkAndReserve(tx, order.productId, 1);
        });
        this.logger.log(
          `Re-reserved 1 unit for order ${order.id} after release (direct)`,
        );
      }
      amount = Number(order.totalAmount);
      // orderId Payment üzerinde UNIQUE — mevcut ödemeyi DURUMDAN BAĞIMSIZ bul
      // (grup/takas dallarındaki findUnique deseniyle aynı). Önceki `findFirst
      // status:pending` H2 claim'i payment'ı `processing` yapınca onu KAÇIRIP yeni
      // create deniyordu → orderId unique → P2002 (500). Artık processing/failed
      // ödeme de bulunur; eşzamanlı ikinci istek claim'de temiz 400 alır.
      const existingOrderPayment = await this.prisma.payment.findUnique({
        where: { orderId: order.id },
      });
      if (existingOrderPayment?.status === PaymentStatus.completed) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderAlreadyPaid"),
        );
      }
      if (existingOrderPayment) {
        payment = existingOrderPayment;
      } else {
        try {
          payment = await this.prisma.payment.create({
            data: {
              orderId: order.id,
              amount: order.totalAmount,
              currency: "TRY",
              provider: PaymentProvider.paytr,
              status: PaymentStatus.pending,
            },
          });
        } catch (e) {
          // find-or-create atomik değil: eşzamanlı ikinci istek de null bulup
          // create'e gider → orderId unique → P2002 (eski davranış 500). Bu, başka
          // bir isteğin bu siparişin ödemesini AYNI ANDA oluşturup işlediği anlamına
          // gelir → kazanan çekimi yapar (201), kaybeden temiz "işleniyor" 400 alır.
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ) {
            throw new BadRequestException(
              i18nMessage("server.payment.paymentCurrentlyProcessing"),
            );
          }
          throw e;
        }
      }
      buyer = buildBuyer(order.buyer, order.shippingAddress);
      basketItems = [
        {
          id: order.product.id,
          name: order.product.title,
          category: "Koleksiyon",
          price: amount,
          quantity: 1,
        },
      ];
      baseOid = String(order.orderNumber || order.id).replace(/-/g, "");
      const isMembershipOrder = order.productId?.startsWith?.("membership-");
      // Misafir siparişinde başarı URL'ine guest=true taşı: aksi halde PayTR
      // dönüşünde /payment/success guest'i tanıyamayıp /login'e atıyor (fatura
      // da görünmüyor). Üyelik ödemesi misafir olamaz.
      successQueryParams = isMembershipOrder
        ? `paymentId=${payment.id}&type=membership`
        : `paymentId=${payment.id}${isGuestOrder ? "&guest=true" : ""}`;
    } else if (dto.checkoutGroupId) {
      const group = await this.prisma.checkoutGroup.findUnique({
        where: { id: dto.checkoutGroupId },
        include: {
          orders: { include: { buyer: true, seller: true, product: true } },
        },
      });
      if (!group || group.orders.length === 0)
        throw new NotFoundException(
          i18nMessage("server.payment.orderGroupNotFound"),
        );
      // Sahiplik: üye → grup alıcısı olmalı; misafir → grup misafir grubu olmalı (iframe ile aynı kural).
      if (userId) {
        if (group.buyerId !== userId)
          throw new ForbiddenException(
            i18nMessage("server.payment.cannotPayForOrderGroup"),
          );
      } else if (!group.isGuest) {
        throw new ForbiddenException(
          i18nMessage("server.payment.loginRequiredForOrder"),
        );
      }
      const now = Date.now();
      for (const o of group.orders) {
        if (o.status !== OrderStatus.pending_payment) {
          throw new BadRequestException(
            i18nMessage("server.payment.groupOrderNotAwaitingPayment"),
          );
        }
        if (o.paymentExpiresAt && o.paymentExpiresAt.getTime() < now) {
          throw new BadRequestException(
            i18nMessage("server.payment.paymentWindowExpired"),
          );
        }
      }
      // 30-dk cron rezervasyonu bıraktıysa charge öncesi sipariş başına CAS ile geri al (oversell koruması).
      for (const o of group.orders) {
        if (o.reservationReleasedAt) {
          await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.order.updateMany({
              where: { id: o.id, reservationReleasedAt: { not: null } },
              data: { reservationReleasedAt: null },
            });
            if (claimed.count === 0) return;
            await this.productLockService.checkAndReserve(tx, o.productId, 1);
          });
          this.logger.log(
            `Re-reserved 1 unit for group order ${o.id} after release (direct)`,
          );
        }
      }
      amount = Number(group.totalAmount);
      const existing = await this.prisma.payment.findUnique({
        where: { checkoutGroupId: group.id },
      });
      if (existing?.status === PaymentStatus.completed)
        throw new BadRequestException(
          i18nMessage("server.payment.orderGroupAlreadyPaid"),
        );
      payment =
        existing ||
        (await this.prisma.payment.create({
          data: {
            checkoutGroupId: group.id,
            amount: group.totalAmount,
            currency: "TRY",
            provider: PaymentProvider.paytr,
            status: PaymentStatus.pending,
          },
        }));
      buyer = buildBuyer(
        group.orders[0].buyer,
        group.orders[0].shippingAddress,
      );
      basketItems = group.orders.map((o: any) => ({
        id: o.product.id,
        name: o.product.title,
        category: "Koleksiyon",
        price: Number(o.totalAmount),
        quantity: 1,
      }));
      baseOid = String(group.groupNumber || group.id).replace(/-/g, "");
      // Misafir grup ödemesinde başarı URL'ine guest=true taşı (yukarıdaki order
      // yolundaki ile aynı sebep: dönüşte /login'e atılmasın, fatura görünsün).
      successQueryParams = `paymentId=${payment.id}${group.isGuest ? "&guest=true" : ""}`;
    } else if (dto.tradeId) {
      const trade = await this.prisma.trade.findUnique({
        where: { id: dto.tradeId },
        include: {
          cashPayment: true,
          initiator: {
            select: { id: true, displayName: true, email: true, phone: true },
          },
          receiver: {
            select: { id: true, displayName: true, email: true, phone: true },
          },
        },
      });
      if (!trade)
        throw new NotFoundException(
          i18nMessage("server.payment.tradeNotFound"),
        );
      const payableStatuses: TradeStatus[] = [
        TradeStatus.accepted,
        TradeStatus.awaiting_payment,
      ];
      if (!payableStatuses.includes(trade.status)) {
        throw new BadRequestException(
          i18nMessage("server.payment.tradeNotAcceptedOrInvalidStatus"),
        );
      }
      if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
        throw new BadRequestException(
          i18nMessage("server.payment.tradeNoCashDifference"),
        );
      }
      if (trade.cashPayerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.payment.onlyDesignatedPayerCanInitiate"),
        );
      }
      const cashPayment = trade.cashPayment;
      if (!cashPayment)
        throw new BadRequestException(
          i18nMessage("server.payment.cashPaymentRecordNotFound"),
        );
      if (cashPayment.status === PaymentStatus.completed)
        throw new BadRequestException(
          i18nMessage("server.payment.tradeCashPaymentAlreadyCompleted"),
        );
      amount = Number(cashPayment.totalAmount);
      const payer =
        trade.cashPayerId === trade.initiatorId
          ? trade.initiator
          : trade.receiver;
      payment =
        (await this.prisma.payment.findUnique({
          where: { tradeCashPaymentId: cashPayment.id },
        })) ||
        (await this.prisma.payment.create({
          data: {
            tradeCashPaymentId: cashPayment.id,
            amount: cashPayment.totalAmount,
            currency: "TRY",
            provider: PaymentProvider.paytr,
            status: PaymentStatus.pending,
          },
        }));
      buyer = buildBuyer(payer);
      basketItems = [
        {
          id: `trade-cash-${trade.id}`,
          name: `Takas #${trade.tradeNumber} Ekstra Ödeme`,
          category: "Takas",
          price: amount,
          quantity: 1,
        },
      ];
      baseOid = `TRADE${String(trade.tradeNumber).replace(/-/g, "")}`;
      successQueryParams = `paymentId=${payment.id}`;
    } else {
      throw new BadRequestException(
        i18nMessage("server.payment.paymentTargetRequired"),
      );
    }

    // ÇİFT-ÇEKİM KORUMASI: bu ödemenin önceki bir denemesi (providerConversationId) varsa,
    // YENİ çekimden ÖNCE PayTR'a durum-sorgu yap. Callback gecikmiş/ulaşmamış (ör. tünel ölü)
    // olabilir ama ödeme PayTR'da BAŞARILI olmuş olabilir. Zaten ödendiyse yeni merchant_oid'le
    // ikinci kez çekme — siparişi tamamlayıp "zaten ödendi" döndür. (verifyPaymentFromClient
    // idempotent: durum-sorgu → ödendiyse processSuccessfulPayment.)
    if (payment.providerConversationId) {
      const verified = await this.paymentLifecycle.verifyPaymentFromClient(
        payment.id,
      );
      if (verified.completed) {
        throw new BadRequestException(
          i18nMessage("server.payment.paymentAlreadyReceived"),
        );
      }
    }

    // merchant_oid + Y8 deseni: eski oid'li callback de eşleşsin diye geçmişini koru.
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;
    const prevMeta = (payment.metadata as any) || {};
    const oidHistory: string[] = Array.isArray(prevMeta.merchantOidHistory)
      ? prevMeta.merchantOidHistory
      : [];
    if (
      payment.providerConversationId &&
      payment.providerConversationId !== merchantOid &&
      !oidHistory.includes(payment.providerConversationId)
    ) {
      oidHistory.push(payment.providerConversationId);
    }
    // H2: ÇİFT-ÇEKİM YARIŞI KORUMASI. Bu payment satırını PayTR çekiminden ÖNCE
    // atomik olarak `processing`'e CLAIM et. Eşzamanlı ikinci bir process-direct
    // (aynı payment satırı, ör. çift tıklama) status'ü `pending`/`failed` BULAMAZ
    // (zaten `processing`) → claim count===0 → reddedilir, ikinci PayTR çekimi
    // yapılmaz. Çekim bitince processDirectPayment status'ü tekrar `pending`'e çeker
    // (callback CAS'ı `pending` bekler). Önceki kod burada koşulsuz `pending` yazıyordu
    // → guard ile gerçek çekim arasında kilit yoktu, iki eşzamanlı çekim mümkündü.
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [PaymentStatus.pending, PaymentStatus.failed] },
      },
      data: {
        providerConversationId: merchantOid,
        providerPaymentId: null,
        status: PaymentStatus.processing,
        failureReason: null,
        // FLOW-H2: 3DS çekiminin BAŞLADIĞI an. Ödeme-satırını-failed-yapma penceresi
        // (cancelExpiredPayments) ve 24s sipariş kill-switch'i (expireUnpaidOrders)
        // bunu `createdAt` yerine kullanır: kullanıcı initiate'ten çok sonra 3DS'e
        // girse bile (createdAt eski, charge yeni) canlı 3DS oturumu iptal EDİLMEZ.
        metadata: {
          ...prevMeta,
          merchantOidHistory: oidHistory,
          lastChargeStartedAt: new Date().toISOString(),
        },
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        i18nMessage("server.payment.paymentCurrentlyProcessing"),
      );
    }
    payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    return {
      payment,
      buyer,
      basketItems,
      merchantOid,
      amount,
      successQueryParams,
    };
  }

  /**
   * Initiate payment for a trade's cash amount (extra money on top of items).
   * Called from TradeController POST /trades/:id/cash-payment/initiate.
   */
  async initiateTradeCashPayment(
    tradeId: string,
    userId: string,
    req?: Request,
  ) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        cashPayment: true,
        initiator: {
          select: { id: true, displayName: true, email: true, phone: true },
        },
        receiver: {
          select: { id: true, displayName: true, email: true, phone: true },
        },
      },
    });

    if (!trade)
      throw new NotFoundException(i18nMessage("server.payment.tradeNotFound"));
    // Safe-trade akışı: cash trade kabul edildiğinde status 'awaiting_payment' olur.
    // Legacy akış için 'accepted' da destekleniyor.
    const payableStatuses: TradeStatus[] = [
      TradeStatus.accepted,
      TradeStatus.awaiting_payment,
    ];
    if (!payableStatuses.includes(trade.status)) {
      throw new BadRequestException(
        i18nMessage("server.payment.tradeNotAcceptedOrInvalidStatus"),
      );
    }
    if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
      throw new BadRequestException(
        i18nMessage("server.payment.tradeNoCashDifference"),
      );
    }
    if (trade.cashPayerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.onlyDesignatedPayerCanInitiate"),
      );
    }

    const cashPayment = trade.cashPayment;
    if (!cashPayment) {
      throw new BadRequestException(
        i18nMessage("server.payment.cashPaymentRecordNotFound"),
      );
    }
    if (cashPayment.status === PaymentStatus.completed) {
      throw new BadRequestException(
        i18nMessage("server.payment.tradeCashPaymentAlreadyCompleted"),
      );
    }

    const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";

    // trade_cash_payment_id is unique: only one Payment per TradeCashPayment. Reuse existing if any.
    const existingPayment = await this.prisma.payment.findUnique({
      where: { tradeCashPaymentId: cashPayment.id },
    });

    const provider = PaymentProvider.paytr;
    const totalAmount = Number(cashPayment.totalAmount);

    // PAYMENT_BYPASS: dev/test — PayTR token üretmeden; istemci bypass-complete çağırır.
    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException(
          i18nMessage("server.payment.tradeCashPaymentAlreadyCompleted"),
        );
      }
      if (bypassEnabled) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.pending,
            failureReason: null,
            providerPaymentId: null,
          },
        });
        this.logger.warn(
          `PAYMENT_BYPASS: trade cash payment ${existingPayment.id} ready for bypass completion`,
        );
        return {
          paymentId: existingPayment.id,
          tradeId,
          amount: totalAmount,
          provider: existingPayment.provider,
          expiresIn: 300,
          useBypass: true,
        };
      }
    }

    // Retry path: reuse existing Payment row but generate a fresh PayTR iframe token,
    // because PayTR iframe tokens are single-use. Returning the old providerPaymentId
    // leads to "Bu ödeme sayfası artık geçersiz" on the PayTR iframe.
    if (existingPayment) {
      // FLOW-M1: CAS reset (bkz. grup/tekil yolu) — koşulsuz update, arada tamamlanan
      // bir trade-cash ödemesini `pending`'e ezmesin. count===0 → zaten ödendi.
      const reset = await this.prisma.payment.updateMany({
        where: {
          id: existingPayment.id,
          status: { not: PaymentStatus.completed },
        },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });
      if (reset.count === 0) {
        throw new BadRequestException(
          i18nMessage("server.payment.tradeCashPaymentAlreadyCompleted"),
        );
      }

      // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
      await this.paymentCommon.assignMerchantOid(
        existingPayment.id,
        `TRADE-${trade.tradeNumber}`,
      );
      return {
        paymentId: existingPayment.id,
        provider: existingPayment.provider,
        expiresIn: 300,
        tradeId,
        amount: totalAmount,
      };
    }

    const payment = await this.prisma.payment.create({
      data: {
        tradeCashPaymentId: cashPayment.id,
        amount: totalAmount,
        currency: "TRY",
        provider,
        status: PaymentStatus.pending,
      },
    });

    await this.paymentCommon.logPaymentAction(
      "created",
      payment.id,
      undefined,
      undefined,
      undefined,
      PaymentStatus.pending,
      {
        amount: totalAmount,
        provider,
        tradeId,
        tradeCashPaymentId: cashPayment.id,
        payerId: userId,
      },
    );

    if (bypassEnabled) {
      this.logger.warn(
        `PAYMENT_BYPASS: trade cash payment ${payment.id} ready for bypass completion`,
      );
      return {
        paymentId: payment.id,
        tradeId,
        amount: totalAmount,
        provider,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
    await this.paymentCommon.assignMerchantOid(
      payment.id,
      `TRADE-${trade.tradeNumber}`,
    );
    return {
      paymentId: payment.id,
      provider,
      expiresIn: 300,
      tradeId,
      amount: totalAmount,
    };
  }

  /**
   * Common payment initiation logic for both authenticated and guest users
   */
  private async processPaymentInitiation(
    order: any,
    dto: InitiatePaymentDto,
    req?: Request,
  ) {
    // Check for existing pending payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatus.pending,
      },
    });

    if (existingPayment) {
      const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";

      // Reset row before reuse: PayTR iframe tokens are single-use, so we must
      // mint a fresh one on every retry (otherwise iframe shows
      // "Bu ödeme sayfası artık geçersiz").
      // FLOW-M1: CAS reset — findFirst(status:pending) ile bu update arasında bir
      // başarı callback'i ödemeyi `completed` yapmış olabilir; KOŞULSUZ update ödenmiş
      // siparişi `pending`'e EZERDİ. count===0 → arada ödendi → "zaten ödendi".
      const reset = await this.prisma.payment.updateMany({
        where: {
          id: existingPayment.id,
          status: { not: PaymentStatus.completed },
        },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });
      if (reset.count === 0) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderAlreadyPaid"),
        );
      }

      // 30-min cron released the reservation; re-acquire it before letting
      // the buyer retry. CAS-gate on reservationReleasedAt: only the request
      // that flips it null actually re-reserves, so concurrent double-clicks
      // can't both increment reservedQuantity.
      if (order.reservationReleasedAt) {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: order.id, reservationReleasedAt: { not: null } },
            data: { reservationReleasedAt: null },
          });
          if (claimed.count === 0) return; // another concurrent retry already won
          await this.productLockService.checkAndReserve(tx, order.productId, 1);
        });
        this.logger.log(
          `Re-reserved 1 unit for order ${order.id} after 30-min release (retry)`,
        );
      }

      if (bypassEnabled) {
        return {
          paymentId: existingPayment.id,
          orderId: order.id,
          amount: Number(order.totalAmount),
          provider: existingPayment.provider,
          expiresIn: 300,
          useBypass: true,
        };
      }

      // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
      await this.paymentCommon.assignMerchantOid(
        existingPayment.id,
        String(order.orderNumber || order.id),
      );
      return {
        paymentId: existingPayment.id,
        orderId: order.id,
        amount: Number(order.totalAmount),
        provider: existingPayment.provider,
        expiresIn: 300,
      };
    }

    // Offer-based order ise: ödeme başlatılırken stok rezerve et.
    // Direct buy'da reserve zaten createDirectBuyOrder'da yapıldı, AMA cron
    // 30-dk sonunda serbest bıraktıysa retry'da yeniden almak gerekir.
    if (order.offerId && !order.reservationReleasedAt) {
      // First-time payment for an offer-flow order — straightforward reserve.
      await this.prisma.$transaction(async (tx) => {
        await this.productLockService.checkAndReserve(tx, order.productId, 1);
      });
      this.logger.log(
        `Reserved 1 unit for offer-based order ${order.id} (product ${order.productId})`,
      );
    } else if (order.reservationReleasedAt) {
      // Retry after 30-min release. CAS-gate on the flag so concurrent
      // initiate calls can't both increment reservedQuantity.
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, reservationReleasedAt: { not: null } },
          data: { reservationReleasedAt: null },
        });
        if (claimed.count === 0) return;
        await this.productLockService.checkAndReserve(tx, order.productId, 1);
      });
      this.logger.log(`Re-reserved 1 unit for order ${order.id} after release`);
    }

    // Create payment record.
    // order_id UNIQUE: bir sipariş için tek Payment. Önceki ödeme başarısız/iptal olduysa
    // (ödeme zaman aşımı → kullanıcı geri dönüp tekrar öder) var olanı YENİDEN KULLAN; aksi halde
    // yeni create 'Unique constraint failed (order_id)' ile 500 verir (re-ödeme akışı çöker).
    const existingOrderPayment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
    });
    let payment;
    if (existingOrderPayment) {
      if (existingOrderPayment.status === PaymentStatus.completed) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderAlreadyPaid"),
        );
      }
      payment = await this.prisma.payment.update({
        where: { id: existingOrderPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
          amount: order.totalAmount,
          provider: PaymentProvider.paytr,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          orderId: dto.orderId,
          amount: order.totalAmount,
          currency: "TRY",
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    // Log payment creation
    await this.paymentCommon.logPaymentAction(
      "created",
      payment.id,
      dto.orderId,
      undefined,
      undefined,
      PaymentStatus.pending,
      {
        amount: Number(order.totalAmount),
        provider: PaymentProvider.paytr,
        buyerId: order.buyerId,
      },
    );

    // PAYMENT_BYPASS: dev/test modunda PayTR'ye gitmeden ödemeyi tamamla
    const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";
    if (bypassEnabled) {
      this.logger.warn(
        `PAYMENT_BYPASS active: payment ${payment.id} ready for bypass completion`,
      );
      return {
        paymentId: payment.id,
        orderId: order.id,
        amount: Number(order.totalAmount),
        provider: PaymentProvider.paytr,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
    await this.paymentCommon.assignMerchantOid(
      payment.id,
      String(order.orderNumber || order.id),
    );
    return {
      paymentId: payment.id,
      orderId: order.id,
      amount: Number(order.totalAmount),
      provider: PaymentProvider.paytr,
      expiresIn: 300, // 5 minutes
    };
  }

  /**
   * Bypass payment completion (dev/test only)
   * Directly marks payment as successful without going through PayTR.
   */
  async bypassCompletePayment(
    paymentId: string,
  ): Promise<{ success: boolean }> {
    const bypassEnabled = this.configService.get("PAYMENT_BYPASS") === "true";
    if (!bypassEnabled) {
      throw new BadRequestException("Payment bypass is not enabled");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        tradeCashPayment: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException(`Payment already ${payment.status}`);
    }

    const did = await this.paymentFulfillment.processSuccessfulPayment(
      payment,
      `bypass:${paymentId}`,
    );
    this.logger.warn(
      `PAYMENT_BYPASS: payment ${paymentId} completed (did=${did})`,
    );

    return { success: did };
  }
}
