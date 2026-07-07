import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { InitiatePaymentDto, PaymentProvider, PayTRCallbackDto, DirectPaymentDto } from './dto';
import { Prisma, PaymentStatus, PaymentHoldStatus, OrderStatus, ProductStatus, SubscriptionStatus, TradeStatus, OfferStatus, RefundRequestStatus, SavedCardStatus } from '@prisma/client';
import { getProductStatusFromQuantity, getReservedAwareStatus } from '../product/helpers/product-status.helper';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { computeRelevanceScore, RELEVANCE_PREMIUM_BONUS } from '../product/helpers/relevance-score';
import { PayTRService, PayTRBuyer } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { ProductLockService } from '../product/product-lock.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/notification.dto';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { StorageService } from '../storage/storage.service';
import { PaymentQueryService } from './payment-query.service';
import { PaymentCommonService } from './payment-common.service';
import { PaymentRefundService } from './payment-refund.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { Request } from 'express';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly invoiceService: InvoiceService,
    private readonly productLockService: ProductLockService,
    private readonly notificationService: NotificationService,
    private readonly suratCargoService: SuratCargoService,
    private readonly commissionLedger: CommissionLedgerService,
    private readonly storageService: StorageService,
    private readonly moduleRef: ModuleRef,
    private readonly paymentQuery: PaymentQueryService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly paymentReconciliation: PaymentReconciliationService,
  ) {}

  // Taşındı: payment-common.service.ts — Sürat kargo iptali (facade delege; imza aynı).
  private async cancelSuratShipmentIfExists(orderId: string, orderNumber: string): Promise<void> {
    return this.paymentCommon.cancelSuratShipmentIfExists(orderId, orderNumber);
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req?: Request): string {
    if (!req) {
      return '127.0.0.1';
    }

    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check for real IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to connection remote address
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  /**
   * Payment'a merchant_oid (providerConversationId) atar — PayTR çağrısı YAPMAZ.
   * iframe kaldırıldıktan sonra ödeme niyeti (initiate) bir conversation id taşımalı ki
   * gelen callback eşleşebilsin ve reconciliation çalışsın. Eski oid'i merchantOidHistory'e
   * taşır (kullanıcı eski oid'le öderse callback yine eşleşir). process-direct daha sonra
   * kendi oid'iyle bunu tazeler (aynı history mantığı).
   */
  private async assignMerchantOid(paymentId: string, baseOidRaw: string): Promise<string> {
    const baseOid = String(baseOidRaw).replace(/-/g, '');
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;
    const current = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { providerConversationId: true, metadata: true },
    });
    const prevMeta = (current?.metadata as any) || {};
    const oidHistory: string[] = Array.isArray(prevMeta.merchantOidHistory)
      ? prevMeta.merchantOidHistory
      : [];
    const prevOid = current?.providerConversationId;
    if (prevOid && prevOid !== merchantOid && !oidHistory.includes(prevOid)) {
      oidHistory.push(prevOid);
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        providerConversationId: merchantOid,
        providerPaymentId: null,
        metadata: { ...prevMeta, merchantOidHistory: oidHistory },
      },
    });
    return merchantOid;
  }

  /**
   * Unified payment initiation for both authenticated and guest users
   * POST /payments/initiate
   */
  async initiatePaymentUnified(userId: string | null, dto: InitiatePaymentDto, req?: Request) {
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
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Check if this is a guest order
    const shippingAddress = order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      // Authenticated user - must be the buyer
      if (order.buyerId !== userId) {
        throw new ForbiddenException('Bu sipariş için ödeme yapamazsınız');
      }
    } else {
      // Guest user - order must be a guest order
      if (!isGuestOrder) {
        throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
      }
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Bu sipariş için ödeme beklenmiyor');
    }

    // 24h kill-switch: defense in depth in case the cron hasn't run yet.
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.',
      );
    }

    return this.processPaymentInitiation(order, dto, req);
  }

  /**
   * Grup ödemesi başlatma: checkout grubundaki TÜM siparişler tek ödemeyle ödenir.
   * Tüm siparişler pending_payment olmalı; biri iptal olduysa grup ödenemez
   * (tutar grubun tamamı olduğundan kısmi tahsilat yapılamaz).
   */
  private async initiateGroupPayment(userId: string | null, dto: InitiatePaymentDto, req?: Request) {
    const group = await this.prisma.checkoutGroup.findUnique({
      where: { id: dto.checkoutGroupId },
      include: {
        orders: {
          include: { buyer: true, seller: true, product: true },
        },
      },
    });

    if (!group || group.orders.length === 0) {
      throw new NotFoundException('Sipariş grubu bulunamadı');
    }

    // Erişim kontrolü
    if (userId) {
      if (group.buyerId !== userId) {
        throw new ForbiddenException('Bu sipariş grubu için ödeme yapamazsınız');
      }
    } else if (!group.isGuest) {
      throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
    }

    const now = Date.now();
    for (const order of group.orders) {
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException(
          `Gruptaki "${order.product?.title ?? order.orderNumber}" siparişi ödeme beklemiyor. Lütfen sepeti yeniden oluşturun.`,
        );
      }
      if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < now) {
        throw new BadRequestException('Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.');
      }
    }

    return this.processGroupPaymentInitiation(group, dto, req);
  }

  /**
   * Grup ödemesi ortak başlatma mantığı (processPaymentInitiation'ın grup karşılığı).
   * Tek Payment satırı checkoutGroupId üzerinden yeniden kullanılır; PayTR'ye
   * groupNumber merchant_oid + sipariş başına basket item ile gidilir.
   */
  private async processGroupPaymentInitiation(group: any, dto: InitiatePaymentDto, req?: Request) {
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
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
        this.logger.log(`Re-reserved 1 unit for group order ${order.id} after release (retry)`);
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
        throw new BadRequestException('Bu sipariş grubu zaten ödendi');
      }
      payment = await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
          amount: totalAmount,
          provider: PaymentProvider.paytr,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          checkoutGroupId: group.id,
          amount: totalAmount,
          currency: 'TRY',
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    await this.logPaymentAction('created', payment.id, undefined, undefined, undefined, PaymentStatus.pending, {
      amount: totalAmount,
      provider: PaymentProvider.paytr,
      checkoutGroupId: group.id,
      groupNumber: group.groupNumber,
      orderIds: group.orders.map((o: any) => o.id),
      buyerId: group.buyerId,
    });

    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS active: group payment ${payment.id} ready for bypass completion`);
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
    await this.assignMerchantOid(payment.id, String(group.groupNumber || group.id));
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
  async initiatePayment(buyerId: string, dto: InitiatePaymentDto, req?: Request) {
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
  async processDirectPayment(userId: string | null, dto: DirectPaymentDto, req?: Request) {
    if (!dto.card && !dto.savedCardId) {
      throw new BadRequestException('Kart bilgisi veya kayıtlı kart seçimi zorunludur.');
    }

    const recurringEnabled = this.configService.get('PAYTR_RECURRING_ENABLED') === 'true';

    // Kayıtlı kart yalnız giriş yapmış kullanıcıya aittir.
    if (dto.savedCardId && !userId) {
      throw new ForbiddenException('Kayıtlı kartla ödeme için giriş yapmanız gerekiyor');
    }
    // Kayıtlı kartla ödeme PayTR Non3D yetkisine bağlı → flag kapalıyken kullanılamaz.
    if (dto.savedCardId && !recurringEnabled) {
      throw new GoneException(
        'Kayıtlı kartla ödeme şu an kullanılamıyor. Lütfen kart bilgilerinizi girin.',
      );
    }

    // Hedefi (sipariş / grup / takas) çöz; ortak Payment + buyer + sepet + merchant_oid hazırlanır.
    // resolveDirectPaymentContext payment'ı atomik olarak `processing`'e CLAIM eder (H2).
    const { payment, buyer, basketItems, merchantOid, amount, successQueryParams } =
      await this.resolveDirectPaymentContext(userId, dto, req);

    try {
      return await this.chargeDirectPayment(
        dto,
        { payment, buyer, basketItems, merchantOid, amount, successQueryParams },
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
      basketItems: Array<{ id: string; name: string; category: string; price: number; quantity: number }>;
      merchantOid: string;
      amount: number;
      successQueryParams: string;
    },
    userId: string | null,
  ) {
    const { payment, buyer, basketItems, merchantOid, amount, successQueryParams } = ctx;
    const recurringEnabled = this.configService.get('PAYTR_RECURRING_ENABLED') === 'true';

    // Flow B — KAYITLI KARTLA ÖDEME: PayTR'da kayıtlı kartla ödeme Non3D recurring servisiyle
    // yapılır (chargeRecurring). Kart sahibi kullanıcı olmalı; require_cvv ise CVV zorunlu.
    // Sonuç callback ile kesinleşir (success/wait_callback) — sipariş/escrow ortak yoldan akar.
    if (dto.savedCardId) {
      const saved = await this.prisma.savedCard.findFirst({
        where: { id: dto.savedCardId, userId: userId as string, status: SavedCardStatus.active },
      });
      if (!saved) throw new NotFoundException('Kayıtlı kart bulunamadı');
      if (saved.requireCvv && !dto.cvv) {
        throw new BadRequestException('Bu kart için CVV gereklidir');
      }
      const r = await this.paytrService.chargeRecurring({
        utoken: saved.utoken,
        ctoken: saved.ctoken,
        amount,
        merchantOid,
        buyer,
        basketItems,
        cvv: dto.cvv,
      });
      if (r.status === 'failed') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { failureReason: r.reason || 'Kayıtlı kartla ödeme başarısız' },
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
    if (!dto.card) throw new BadRequestException('Kart bilgisi zorunludur.');
    const storeCard = !!dto.saveCard && !!userId && recurringEnabled;
    const result = await this.paytrService.createDirectPayment(
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
      status: 'pending' as const,
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
    basketItems: Array<{ id: string; name: string; category: string; price: number; quantity: number }>;
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
        (isGuest ? sa.fullName || sa.guestName : u?.displayName) || u?.displayName || 'Müşteri',
      ).trim();
      const parts = fullName.split(/\s+/);
      return {
        name: parts[0] || 'Müşteri',
        surname: parts.slice(1).join(' ') || parts[0] || 'Müşteri',
        email: (isGuest ? sa.guestEmail : u?.email) || u?.email,
        phone: sa.phone || sa.guestPhone || u?.phone || '+905000000000',
        ip: clientIp,
        address: sa.address || sa.fullAddress || 'Türkiye',
        city: sa.city || 'İstanbul',
        country: 'Türkiye',
      };
    };

    let payment: any;
    let buyer: PayTRBuyer;
    let basketItems: Array<{ id: string; name: string; category: string; price: number; quantity: number }>;
    let baseOid: string;
    let amount: number;
    let successQueryParams: string;

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        include: { buyer: true, seller: true, product: true },
      });
      if (!order) throw new NotFoundException('Sipariş bulunamadı');
      // Sahiplik: üye → alıcı olmalı; misafir → sipariş misafir siparişi olmalı (iframe ile aynı kural).
      const isGuestOrder = (order.shippingAddress as any)?.isGuestOrder === true;
      if (userId) {
        if (order.buyerId !== userId) throw new ForbiddenException('Bu sipariş için ödeme yapamazsınız');
      } else if (!isGuestOrder) {
        throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
      }
      if (order.status !== OrderStatus.pending_payment) {
        throw new BadRequestException('Bu sipariş için ödeme beklenmiyor');
      }
      if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.');
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
        this.logger.log(`Re-reserved 1 unit for order ${order.id} after release (direct)`);
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
        throw new BadRequestException('Bu sipariş zaten ödendi');
      }
      payment =
        existingOrderPayment ||
        (await this.prisma.payment.create({
          data: {
            orderId: order.id,
            amount: order.totalAmount,
            currency: 'TRY',
            provider: PaymentProvider.paytr,
            status: PaymentStatus.pending,
          },
        }));
      buyer = buildBuyer(order.buyer, order.shippingAddress);
      basketItems = [
        { id: order.product.id, name: order.product.title, category: 'Koleksiyon', price: amount, quantity: 1 },
      ];
      baseOid = String(order.orderNumber || order.id).replace(/-/g, '');
      const isMembershipOrder = order.productId?.startsWith?.('membership-');
      // Misafir siparişinde başarı URL'ine guest=true taşı: aksi halde PayTR
      // dönüşünde /payment/success guest'i tanıyamayıp /login'e atıyor (fatura
      // da görünmüyor). Üyelik ödemesi misafir olamaz.
      successQueryParams = isMembershipOrder
        ? `paymentId=${payment.id}&type=membership`
        : `paymentId=${payment.id}${isGuestOrder ? '&guest=true' : ''}`;
    } else if (dto.checkoutGroupId) {
      const group = await this.prisma.checkoutGroup.findUnique({
        where: { id: dto.checkoutGroupId },
        include: { orders: { include: { buyer: true, seller: true, product: true } } },
      });
      if (!group || group.orders.length === 0) throw new NotFoundException('Sipariş grubu bulunamadı');
      // Sahiplik: üye → grup alıcısı olmalı; misafir → grup misafir grubu olmalı (iframe ile aynı kural).
      if (userId) {
        if (group.buyerId !== userId) throw new ForbiddenException('Bu sipariş grubu için ödeme yapamazsınız');
      } else if (!group.isGuest) {
        throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
      }
      const now = Date.now();
      for (const o of group.orders) {
        if (o.status !== OrderStatus.pending_payment) {
          throw new BadRequestException('Gruptaki bir sipariş ödeme beklemiyor. Lütfen sepeti yeniden oluşturun.');
        }
        if (o.paymentExpiresAt && o.paymentExpiresAt.getTime() < now) {
          throw new BadRequestException('Ödeme süresi doldu. Lütfen yeni bir sipariş oluşturun.');
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
          this.logger.log(`Re-reserved 1 unit for group order ${o.id} after release (direct)`);
        }
      }
      amount = Number(group.totalAmount);
      const existing = await this.prisma.payment.findUnique({ where: { checkoutGroupId: group.id } });
      if (existing?.status === PaymentStatus.completed) throw new BadRequestException('Bu sipariş grubu zaten ödendi');
      payment =
        existing ||
        (await this.prisma.payment.create({
          data: {
            checkoutGroupId: group.id,
            amount: group.totalAmount,
            currency: 'TRY',
            provider: PaymentProvider.paytr,
            status: PaymentStatus.pending,
          },
        }));
      buyer = buildBuyer(group.orders[0].buyer, group.orders[0].shippingAddress);
      basketItems = group.orders.map((o: any) => ({
        id: o.product.id,
        name: o.product.title,
        category: 'Koleksiyon',
        price: Number(o.totalAmount),
        quantity: 1,
      }));
      baseOid = String(group.groupNumber || group.id).replace(/-/g, '');
      // Misafir grup ödemesinde başarı URL'ine guest=true taşı (yukarıdaki order
      // yolundaki ile aynı sebep: dönüşte /login'e atılmasın, fatura görünsün).
      successQueryParams = `paymentId=${payment.id}${group.isGuest ? '&guest=true' : ''}`;
    } else if (dto.tradeId) {
      const trade = await this.prisma.trade.findUnique({
        where: { id: dto.tradeId },
        include: {
          cashPayment: true,
          initiator: { select: { id: true, displayName: true, email: true, phone: true } },
          receiver: { select: { id: true, displayName: true, email: true, phone: true } },
        },
      });
      if (!trade) throw new NotFoundException('Takas bulunamadı');
      const payableStatuses: TradeStatus[] = [TradeStatus.accepted, TradeStatus.awaiting_payment];
      if (!payableStatuses.includes(trade.status)) {
        throw new BadRequestException('Takas henüz kabul edilmedi veya uygun durumda değil');
      }
      if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
        throw new BadRequestException('Bu takasta ekstra ödeme bulunmuyor');
      }
      if (trade.cashPayerId !== userId) {
        throw new ForbiddenException('Bu ödemeyi sadece belirlenmiş ödeyen taraf başlatabilir');
      }
      const cashPayment = trade.cashPayment;
      if (!cashPayment) throw new BadRequestException('Nakit ödeme kaydı bulunamadı');
      if (cashPayment.status === PaymentStatus.completed) throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
      amount = Number(cashPayment.totalAmount);
      const payer = trade.cashPayerId === trade.initiatorId ? trade.initiator : trade.receiver;
      payment =
        (await this.prisma.payment.findUnique({ where: { tradeCashPaymentId: cashPayment.id } })) ||
        (await this.prisma.payment.create({
          data: {
            tradeCashPaymentId: cashPayment.id,
            amount: cashPayment.totalAmount,
            currency: 'TRY',
            provider: PaymentProvider.paytr,
            status: PaymentStatus.pending,
          },
        }));
      buyer = buildBuyer(payer);
      basketItems = [
        { id: `trade-cash-${trade.id}`, name: `Takas #${trade.tradeNumber} Ekstra Ödeme`, category: 'Takas', price: amount, quantity: 1 },
      ];
      baseOid = `TRADE${String(trade.tradeNumber).replace(/-/g, '')}`;
      successQueryParams = `paymentId=${payment.id}`;
    } else {
      throw new BadRequestException('orderId, checkoutGroupId veya tradeId zorunludur.');
    }

    // ÇİFT-ÇEKİM KORUMASI: bu ödemenin önceki bir denemesi (providerConversationId) varsa,
    // YENİ çekimden ÖNCE PayTR'a durum-sorgu yap. Callback gecikmiş/ulaşmamış (ör. tünel ölü)
    // olabilir ama ödeme PayTR'da BAŞARILI olmuş olabilir. Zaten ödendiyse yeni merchant_oid'le
    // ikinci kez çekme — siparişi tamamlayıp "zaten ödendi" döndür. (verifyPaymentFromClient
    // idempotent: durum-sorgu → ödendiyse processSuccessfulPayment.)
    if (payment.providerConversationId) {
      const verified = await this.verifyPaymentFromClient(payment.id);
      if (verified.completed) {
        throw new BadRequestException(
          'Bu ödeme zaten alınmış görünüyor. Lütfen sayfayı yenileyin; tekrar ödeme yapmanıza gerek yok.',
        );
      }
    }

    // merchant_oid + Y8 deseni: eski oid'li callback de eşleşsin diye geçmişini koru.
    const merchantOid = `${baseOid}T${Date.now().toString().slice(-6)}`;
    const prevMeta = (payment.metadata as any) || {};
    const oidHistory: string[] = Array.isArray(prevMeta.merchantOidHistory) ? prevMeta.merchantOidHistory : [];
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
        metadata: { ...prevMeta, merchantOidHistory: oidHistory },
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Bu ödeme şu anda işleniyor. Lütfen birkaç saniye bekleyip tekrar deneyin.',
      );
    }
    payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });

    return { payment, buyer, basketItems, merchantOid, amount, successQueryParams };
  }

  /**
   * Initiate payment for a trade's cash amount (extra money on top of items).
   * Called from TradeController POST /trades/:id/cash-payment/initiate.
   */
  async initiateTradeCashPayment(tradeId: string, userId: string, req?: Request) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        cashPayment: true,
        initiator: { select: { id: true, displayName: true, email: true, phone: true } },
        receiver: { select: { id: true, displayName: true, email: true, phone: true } },
      },
    });

    if (!trade) throw new NotFoundException('Takas bulunamadı');
    // Safe-trade akışı: cash trade kabul edildiğinde status 'awaiting_payment' olur.
    // Legacy akış için 'accepted' da destekleniyor.
    const payableStatuses: TradeStatus[] = [
      TradeStatus.accepted,
      TradeStatus.awaiting_payment,
    ];
    if (!payableStatuses.includes(trade.status)) {
      throw new BadRequestException('Takas henüz kabul edilmedi veya uygun durumda değil');
    }
    if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
      throw new BadRequestException('Bu takasta ekstra ödeme bulunmuyor');
    }
    if (trade.cashPayerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi sadece belirlenmiş ödeyen taraf başlatabilir');
    }

    const cashPayment = trade.cashPayment;
    if (!cashPayment) {
      throw new BadRequestException('Nakit ödeme kaydı bulunamadı');
    }
    if (cashPayment.status === PaymentStatus.completed) {
      throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
    }

    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';

    // trade_cash_payment_id is unique: only one Payment per TradeCashPayment. Reuse existing if any.
    const existingPayment = await this.prisma.payment.findUnique({
      where: { tradeCashPaymentId: cashPayment.id },
    });

    const provider = PaymentProvider.paytr;
    const totalAmount = Number(cashPayment.totalAmount);

    // PAYMENT_BYPASS: dev/test — PayTR token üretmeden; istemci bypass-complete çağırır.
    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
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
        this.logger.warn(`PAYMENT_BYPASS: trade cash payment ${existingPayment.id} ready for bypass completion`);
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
      await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });

      // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
      await this.assignMerchantOid(existingPayment.id, `TRADE-${trade.tradeNumber}`);
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
        currency: 'TRY',
        provider,
        status: PaymentStatus.pending,
      },
    });

    await this.logPaymentAction('created', payment.id, undefined, undefined, undefined, PaymentStatus.pending, {
      amount: totalAmount,
      provider,
      tradeId,
      tradeCashPaymentId: cashPayment.id,
      payerId: userId,
    });

    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS: trade cash payment ${payment.id} ready for bypass completion`);
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
    await this.assignMerchantOid(payment.id, `TRADE-${trade.tradeNumber}`);
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
  private async processPaymentInitiation(order: any, dto: InitiatePaymentDto, req?: Request) {
    // Check for existing pending payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatus.pending,
      },
    });

    if (existingPayment) {
      const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';

      // Reset row before reuse: PayTR iframe tokens are single-use, so we must
      // mint a fresh one on every retry (otherwise iframe shows
      // "Bu ödeme sayfası artık geçersiz").
      await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.pending,
          failureReason: null,
          providerPaymentId: null,
        },
      });

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
      await this.assignMerchantOid(existingPayment.id, String(order.orderNumber || order.id));
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
      this.logger.log(`Reserved 1 unit for offer-based order ${order.id} (product ${order.productId})`);
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
        throw new BadRequestException('Bu sipariş zaten ödendi');
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
          currency: 'TRY',
          provider: PaymentProvider.paytr,
          status: PaymentStatus.pending,
        },
      });
    }

    // Log payment creation
    await this.logPaymentAction('created', payment.id, dto.orderId, undefined, undefined, PaymentStatus.pending, {
      amount: Number(order.totalAmount),
      provider: PaymentProvider.paytr,
      buyerId: order.buyerId,
    });

    // PAYMENT_BYPASS: dev/test modunda PayTR'ye gitmeden ödemeyi tamamla
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (bypassEnabled) {
      this.logger.warn(`PAYMENT_BYPASS active: payment ${payment.id} ready for bypass completion`);
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
    await this.assignMerchantOid(payment.id, String(order.orderNumber || order.id));
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
  async bypassCompletePayment(paymentId: string): Promise<{ success: boolean }> {
    const bypassEnabled = this.configService.get('PAYMENT_BYPASS') === 'true';
    if (!bypassEnabled) {
      throw new BadRequestException('Payment bypass is not enabled');
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
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException(`Payment already ${payment.status}`);
    }

    const did = await this.processSuccessfulPayment(payment, `bypass:${paymentId}`);
    this.logger.warn(`PAYMENT_BYPASS: payment ${paymentId} completed (did=${did})`);

    return { success: did };
  }

  /**
   * Resolve payment row for PayTR callback (merchant_oid matches providerConversationId, orderId, or token substring).
   */
  private async findPaymentForPaytrCallback(merchantOid: string) {
    const callbackInclude = {
      order: {
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      },
      checkoutGroup: {
        include: {
          orders: {
            include: { buyer: true, seller: true, product: true },
          },
        },
      },
      tradeCashPayment: true,
    } as const;

    let payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerConversationId: merchantOid },
          { orderId: merchantOid },
        ],
      },
      include: callbackInclude,
    });

    // Y8: Re-init'te providerConversationId yeni oid ile ezilir; kullanıcı eski token'la
    // ödemiş olabilir → eski oid'i metadata.merchantOidHistory'de arıyoruz. (O8: eski
    // `providerPaymentId contains merchantOid` fallback'i anlamsızdı — providerPaymentId
    // PayTR token'ıdır, merchant_oid içermez — kaldırıldı.)
    if (!payment) {
      payment = await this.prisma.payment.findFirst({
        where: {
          metadata: { path: ['merchantOidHistory'], array_contains: merchantOid },
        },
        include: callbackInclude,
      });
    }

    return payment;
  }

  /**
   * Hash mismatch: do not trust callback body; verify via PayTR durum-sorgu when a pending PayTR payment exists.
   * Returns OK so PayTR stops retrying; logs errors for ops.
   */
  private async handlePayTRCallbackHashMismatch(dto: PayTRCallbackDto): Promise<string> {
    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      this.logger.error(
        `PayTR callback invalid hash and no payment row: merchant_oid=${dto.merchant_oid} status=${dto.status}`,
      );
      throw new NotFoundException('Payment not found');
    }

    if (payment.provider !== PaymentProvider.paytr) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} provider=${payment.provider} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.status !== PaymentStatus.pending) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} status=${payment.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.orderId && payment.order && payment.order.status !== OrderStatus.pending_payment) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} orderStatus=${payment.order.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const oid =
      (payment.providerConversationId || dto.merchant_oid || '').trim() || dto.merchant_oid.trim();

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(oid.replace(/-/g, ''));
    }

    if (!inquiry.ok) {
      const fail = inquiry as { ok: false; errNo?: string; errMsg?: string };
      this.logger.error(
        `PayTR hash mismatch: durum-sorgu failed payment=${payment.id} merchant_oid=${dto.merchant_oid} oid=${oid} err=${fail.errMsg ?? fail.errNo ?? 'unknown'} ourAmount=${Number(payment.amount)}`,
      );
      return 'OK';
    }

    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.error(
        `PayTR hash mismatch: amount mismatch payment=${payment.id} merchant_oid=${dto.merchant_oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return 'OK';
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ''
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.processSuccessfulPayment(payment, txnRef);
    if (did) {
      this.logger.log(
        `PayTR hash mismatch recovered via durum-sorgu payment=${payment.id} merchant_oid=${dto.merchant_oid} dtoStatus=${dto.status}`,
      );
    }
    return 'OK';
  }

  /**
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log('PayTR callback received');

    // PayTR keeps retrying unless we reply with literal "OK". Always return
    // "OK" — even on bad/missing payloads — and just log the issue.
    if (!dto.merchant_oid || !dto.status || !dto.total_amount || !dto.hash) {
      this.logger.warn(
        `PayTR callback missing required fields: merchant_oid=${dto.merchant_oid} status=${dto.status} total_amount=${dto.total_amount} hash=${dto.hash ? 'present' : 'missing'}`,
      );
      return 'OK';
    }

    const isValid = this.paytrService.verifyCallback({
      merchant_oid: dto.merchant_oid,
      status: dto.status as 'success' | 'failed',
      total_amount: dto.total_amount,
      hash: dto.hash,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
    });

    if (!isValid) {
      return this.handlePayTRCallbackHashMismatch(dto);
    }

    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      this.logger.warn(`PayTR callback: payment not found for merchant_oid=${dto.merchant_oid}`);
      return 'OK';
    }

    if (dto.status === 'success') {
      // Y16: Hash geçerli (otantik PayTR) olsa bile tutarı doğrula. PayTR beklenenden
      // farklı bir tutar bildirirse (ör. kısmi capture veya gevşek eşleşme), siparişi
      // YANLIŞ tutarla completed yapmayalım. Tolerans dışıysa logla ve tamamlama —
      // para PayTR'da kalır, sipariş pending kalır ve reconcile/manuel inceleme ele alır.
      const toleranceTl = parseFloat(
        this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
      );
      const expectedKurus = Math.round(Number(payment.amount) * 100);
      const callbackKurus = parseInt(dto.total_amount, 10);
      if (Math.abs(callbackKurus - expectedKurus) / 100 > toleranceTl) {
        this.logger.error(
          `PayTR callback tutar uyuşmazlığı (merchant_oid=${dto.merchant_oid}): ` +
            `beklenen ${expectedKurus} kuruş, gelen ${callbackKurus} kuruş — ` +
            `ödeme TAMAMLANMADI, manuel inceleme gerekir`,
        );
        return 'OK';
      }
      await this.processSuccessfulPayment(payment, dto.merchant_oid);
      // CAPI (Faz 3): store_card ödemesinde PayTR bildirimle utoken döndürür → kullanıcının
      // kayıtlı kartlarını SavedCard'a senkronla (recurring için). Best-effort, ödemeyi etkilemez.
      if (dto.utoken && payment.order?.buyerId) {
        try {
          await this.syncSavedCardsFromUtoken(payment.order.buyerId, dto.utoken);
        } catch (e: any) {
          this.logger.error(`SavedCard senkron hatası (oid=${dto.merchant_oid}): ${e?.message}`);
        }
      }
    } else {
      await this.processFailedPayment(payment, dto.failed_reason_msg || 'PayTR payment failed');
    }

    return 'OK';
  }

  // Taşındı: payment-common.service.ts — ödeme aksiyonu audit log'u (facade delege; imza aynı).
  private async logPaymentAction(
    action: string,
    paymentId: string,
    orderId?: string,
    adminUserId?: string,
    oldStatus?: PaymentStatus,
    newStatus?: PaymentStatus,
    metadata?: any,
  ) {
    return this.paymentCommon.logPaymentAction(
      action,
      paymentId,
      orderId,
      adminUserId,
      oldStatus,
      newStatus,
      metadata,
    );
  }

  /**
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   * @returns true if this invocation completed the payment; false if already completed (idempotent / race with callback).
   */
  private async processSuccessfulPayment(payment: any, transactionId?: string): Promise<boolean> {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(payment, transactionId);
    }

    // Grup ödemesi: tüm grup siparişleri tek transaction'da işlenir
    if (payment.checkoutGroupId && !payment.orderId) {
      return this.processSuccessfulGroupPayment(payment, transactionId);
    }

    const cancelledOrders: {
      orderId: string;
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: { buyerId: string; productId: string; productTitle: string }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const oldStatus = payment.status;

      const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
        action: 'payment.completed',
        timestamp: new Date().toISOString(),
        oldStatus,
        newStatus: PaymentStatus.completed,
        transactionId: transactionId || payment.providerPaymentId,
      });

      const newMetadata = {
        ...(payment.metadata as any || {}),
        auditHistory,
      };

      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.pending,
        },
        data: {
          status: PaymentStatus.completed,
          paidAt: new Date(),
          providerPaymentId: transactionId || payment.providerPaymentId,
          metadata: newMetadata as object,
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      // Verify order is still pending_payment before promoting to preparing.
      // Race window: cron may have cancelled the order while PayTR callback was in flight.
      const currentOrder = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { status: true, orderNumber: true },
      });

      if (currentOrder?.status === OrderStatus.cancelled) {
        this.logger.warn(
          `Payment ${payment.id} succeeded but order ${payment.orderId} (${currentOrder.orderNumber}) already cancelled. Auto-refund required.`,
        );
        return { autoRefundRequired: true, orderId: payment.orderId, paymentId: payment.id };
      }

      // Update order status to PREPARING with shipping deadline for the seller
      const preparingDays = parseInt(
        this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
        10,
      );
      const preparingDeadline = new Date();
      preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.preparing,
          preparingDeadline,
          version: { increment: 1 },
        },
      });

      // Check if this is a membership order (productId starts with "membership-")
      const isMembershipOrder = payment.order?.productId?.startsWith('membership-') ?? false;
      // Boost (öne çıkarma) siparişi mi? (productId "boost-" ile başlar)
      const isBoostOrder = payment.order?.productId?.startsWith('boost-') ?? false;
      const productIdsToInvalidate: string[] = [];

      if (isMembershipOrder) {
        // Activate membership for the buyer
        const membership = await tx.userMembership.findUnique({
          where: { userId: payment.order.buyerId },
          include: { tier: true },
        });

        if (membership) {
          await tx.userMembership.update({
            where: { userId: payment.order.buyerId },
            data: {
              status: SubscriptionStatus.active,
              cancelledAt: null,
            },
          });

          // Premium (free olmayan) üyelik aktifleşti: satıcının boost'suz aktif ilanlarını
          // premium kademesine (rankTier=1) yükselt. Boost'lu (2) ürünlere dokunma.
          if (membership.tier.type !== 'free') {
            await tx.product.updateMany({
              where: {
                sellerId: payment.order.buyerId,
                status: ProductStatus.active,
                rankTier: 0,
              },
              // rankTier 0→1; relevanceScore'a premium bonusu ekle (kademe 0→1 farkı)
              data: { rankTier: 1, relevanceScore: { increment: RELEVANCE_PREMIUM_BONUS } },
            });
          }

          // Update membership payment record
          await tx.membershipPayment.updateMany({
            where: {
              membershipId: membership.id,
              status: 'pending',
            },
            data: {
              status: 'completed',
              providerPaymentId: transactionId || payment.providerPaymentId,
            },
          });

          this.logger.log(`Membership activated for user ${payment.order.buyerId} after payment ${payment.id}`);
        }

        // Üyelik sanal hizmettir: kargo/teslimat akışına girmesin → terminal "completed".
        // (Paylaşılan kod yukarıda preparing yapmıştı; boost ile aynı override.)
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.completed, preparingDeadline: null },
        });

        // Yetim sipariş temizliği: kullanıcı birden çok kez "Ödemeyi tamamla"ya
        // basıp yarım bıraktıysa, aynı sanal üründen başka pending_payment
        // siparişler kalmış olabilir. Üyelik artık aktif → onları iptal et ki
        // sarı "ödemeyi tamamla" uyarısı / yetim ödeme kayıtları kalmasın.
        const siblingPendings = await tx.order.findMany({
          where: {
            buyerId: payment.order.buyerId,
            productId: payment.order.productId,
            status: OrderStatus.pending_payment,
            id: { not: payment.orderId },
          },
          select: { id: true },
        });
        if (siblingPendings.length > 0) {
          const ids = siblingPendings.map((o) => o.id);
          await tx.order.updateMany({
            where: { id: { in: ids } },
            data: { status: OrderStatus.cancelled },
          });
          await tx.payment.updateMany({
            where: { orderId: { in: ids }, status: PaymentStatus.pending },
            data: { status: PaymentStatus.failed, failureReason: 'Üyelik başka ödeme ile tamamlandı' },
          });
          this.logger.log(`Cancelled ${ids.length} sibling pending membership orders for user ${payment.order.buyerId}`);
        }
      } else if (isBoostOrder) {
        // Boost siparişi: ilgili ProductBoost'u aktive et, ürünü sponsorlu kademesine (rankTier=2) al.
        // Stok/quantity'ye DOKUNULMAZ — boost sanal bir hizmet, fiziksel ürün değil.
        const boost = await tx.productBoost.findUnique({
          where: { orderId: payment.orderId },
        });
        if (boost) {
          const nowTs = new Date();
          // Stacking: ilanda hâlâ aktif bir boost varsa, yeni süre kalan sürenin ÜSTÜNE eklenir.
          // (örn. kalan 15 gün + yeni 30 gün = toplam 45 gün)
          const boostedProduct = await tx.product.findUnique({
            where: { id: boost.productId },
            select: { boostedUntil: true, qualityScore: true, popularityScore: true },
          });
          const base =
            boostedProduct?.boostedUntil && boostedProduct.boostedUntil > nowTs
              ? boostedProduct.boostedUntil
              : nowTs;
          const startsAt = nowTs;
          const endsAt = new Date(
            base.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
          );
          await tx.productBoost.update({
            where: { id: boost.id },
            data: { status: 'active', startsAt, endsAt },
          });
          await tx.product.update({
            where: { id: boost.productId },
            data: {
              boostedUntil: endsAt,
              rankTier: 2,
              relevanceScore: computeRelevanceScore({
                rankTier: 2,
                qualityScore: boostedProduct?.qualityScore ?? 0,
                popularityScore: boostedProduct?.popularityScore,
              }),
            },
          });
          // Boost sanal hizmettir: sipariş kargo/teslimat akışına girmesin → terminal "completed".
          // (Paylaşılan kod yukarıda preparing yapmıştı; burada override ediyoruz.)
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: OrderStatus.completed, preparingDeadline: null },
          });
          productIdsToInvalidate.push(boost.productId);
          this.logger.log(
            `Boost activated for product ${boost.productId} until ${endsAt.toISOString()} after payment ${payment.id}`,
          );
        } else {
          this.logger.warn(`Boost order ${payment.orderId} paid but no matching ProductBoost found`);
        }
      } else {
        // Regular product order: ödeme başarılı → quantity--, reservedQuantity--
        productIdsToInvalidate.push(payment.order.productId);
        // Bulgu E: ürün satırını FOR UPDATE ile kilitle. Rezervasyon normalde 1-stoklu
        // üründe ikinci ödemeyi engeller, ama reservedQuantity drift'i olursa iki eşzamanlı
        // ödeme quantity'yi negatife itebilir. Kilit + clamp'li mutlak set bunu kapatır.
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${payment.order.productId} FOR UPDATE`;
        const product = await tx.product.findUnique({
          where: { id: payment.order.productId },
        });

        if (!product) {
          throw new Error('Product not found');
        }

        const orderQty = payment.order?.quantity ?? 1;
        const newQuantity =
          product.quantity !== null ? Math.max(0, product.quantity - orderQty) : null;
        const updateData: any = {
          status: getProductStatusFromQuantity(newQuantity),
          reservedQuantity: safeDecrementReserved(product.reservedQuantity, orderQty),
        };
        if (product.quantity !== null) {
          // Clamp'li mutlak set (FOR UPDATE kilidi altında yarışsız); { decrement } yerine
          // GREATEST(quantity-orderQty, 0) eşdeğeri — negatif stok imkânsız.
          updateData.quantity = newQuantity;
        }

        await tx.product.update({
          where: { id: payment.order.productId },
          data: updateData,
        });

        // Stockout cascade: only when PHYSICAL stock is actually drained
        // (quantity <= 0), cancel other open offers/orders for the same product
        // within the same transaction so no other buyer can complete a payment
        // that would push stock negative. The order matters: invalidate pending
        // orders FIRST (so their linked offers chain-cancel atomically), then
        // sweep any remaining standalone offers. Both helpers are idempotent
        // w.r.t. already-terminal rows, and the order helper now safely clamps
        // the reservedQuantity decrement.
        //
        // NOTE: we intentionally gate on physical `quantity`, NOT on
        // `quantity - reservedQuantity`. reservedQuantity still includes OTHER
        // buyers' legitimate pending_payment orders, each of which has a real
        // physical unit waiting for it. Gating on available-for-new-buyers (q-r)
        // would wrongly cancel those valid orders whenever stock > 1 and
        // multiple buyers checked out concurrently (e.g. 2 stock + 2 buyers:
        // after the first payment q=1,r=1 → available=0 → the still-valid second
        // order gets cancelled and auto-refunded even though a unit remained).
        const refreshed = await tx.product.findUnique({
          where: { id: payment.order.productId },
          select: { quantity: true, reservedQuantity: true, categoryId: true },
        });
        if (refreshed && refreshed.quantity !== null && refreshed.quantity <= 0) {
          stockoutCategoryId = refreshed.categoryId ?? null;
          const orderResult = await this.productLockService.invalidatePendingOrdersForProduct(
            tx,
            payment.order.productId,
            'Stok tükendi',
          );
          const offerResult = await this.productLockService.invalidateRelatedOffers(
            tx,
            payment.order.productId,
          );
          cancelledOrders.push(
            ...orderResult.cancelledOrders.map((o) => ({
              orderId: o.orderId,
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
              offerId: o.offerId,
              hadPayment: o.hadPayment,
            })),
          );
          cancelledOffers.push(
            ...offerResult.rejectedOffers.map((o) => ({
              buyerId: o.buyerId,
              productId: o.productId,
              productTitle: o.productTitle,
            })),
          );
        }

        this.logger.log(
          `Product ${payment.order.productId} stock updated: quantity=${newQuantity}, reserved=${updateData.reservedQuantity}`,
        );
      }

      // Get full order details for event emission
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });

      if (!order) {
        throw new Error('Order not found after payment');
      }

      // Only create payment hold for regular product orders (not membership/boost orders)
      if (!isMembershipOrder && !isBoostOrder) {
        // Calculate seller payout (amount - commission)
        const sellerAmount = Number(order.totalAmount) - Number(order.commissionAmount);

        // Create payment hold for seller (escrow). releaseAt ödeme anında SET
        // EDİLMEZ; teslimde (shipping.worker delivered) deliveredAt + return + grace
        // olarak hesaplanır. Teslim olmadan asla serbest bırakılmaz (releaseAt null).
        await tx.paymentHold.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            sellerId: order.sellerId,
            amount: sellerAmount,
            status: PaymentHoldStatus.held,
            releaseAt: null,
          },
        });

        // CommissionLedger satırı — pending (Faz 3A.2). Spec Bölüm 5.1.
        await this.commissionLedger.upsertPending({
          orderId: payment.orderId,
          sellerCommission: order.commissionAmount,
          buyerFee: order.buyerFeeAmount,
          tx,
        });

        this.logger.log(`Payment ${payment.id} completed, hold created for seller ${order.sellerId}`);
      } else {
        this.logger.log(`Virtual order payment ${payment.id} (membership/boost) completed, no hold needed`);
      }

      return { order, productIdsToInvalidate };
    });

    if (!result) {
      this.logger.log(
        `processSuccessfulPayment: payment ${payment.id} already completed — skipping duplicate success handling`,
      );
      return false;
    }

    // Handle auto-refund: payment succeeded but order was already cancelled (race with cron)
    if ('autoRefundRequired' in result && result.autoRefundRequired) {
      const refundOrderId = (result as any).orderId;
      const refundPaymentId = (result as any).paymentId;
      this.logger.warn(`Auto-refunding payment ${refundPaymentId} — order ${refundOrderId} was already cancelled`);
      try {
        await this.processRefund(refundOrderId);
        this.logger.log(`Auto-refund completed for order ${refundOrderId}`);
      } catch (refundError: any) {
        this.logger.error(
          `AUTO-REFUND FAILED for order ${refundOrderId}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
      return true;
    }

    const resultOrder = result.order;
    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }

    // Stockout cascade notifications: dispatch AFTER tx commits so failures
    // here don't roll back the payment. One notification per buyer.
    //
    // An accepted-but-unpaid offer creates a pending_payment Order with no
    // Payment row and no stock reservation (offer.service.ts acceptOffer). When
    // stock runs out that Order is cancelled — but since the buyer never paid,
    // it is really a cancelled OFFER, so we send "Teklifiniz iptal edildi"
    // rather than the misleading "Siparişiniz iptal edildi". Direct-buy orders
    // (no offer) and orders whose payment was already initiated keep the
    // order-cancelled message.
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        : this.notificationService.notifyOrderCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId);
      await notify.catch((err) =>
        this.logger.warn(`stockout-notify (${isUnpaidOffer ? 'offer' : 'order'}) failed for ${o.buyerId}: ${err.message}`),
      );
    }
    // Sipariş iptali e-postaları (alıcı+satıcı) — sipariş bazlı; teklif
    // iptallerini (isUnpaidOffer) ve mükerrer order'ları atla.
    const emailedCancelledOrders = new Set<string>();
    for (const o of cancelledOrders) {
      if (o.offerId !== null && !o.hadPayment) continue;
      if (emailedCancelledOrders.has(o.orderId)) continue;
      emailedCancelledOrders.add(o.orderId);
      await this.notificationService.sendOrderCancelledEmails(o.orderId);
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        .catch((err) =>
          this.logger.warn(`stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`),
        );
    }

    // Emit order.paid event AFTER transaction commits (only for regular product orders, not membership/boost)
    // This publishes jobs to email, push, and shipping queues
    const isMembershipOrder = resultOrder.productId.startsWith('membership-');
    const isBoostOrder = resultOrder.productId.startsWith('boost-');

    // Ürün listesi cache'ini temizle:
    // - Boost: öne çıkarma sıralamayı etkiler.
    // - Normal ürün siparişi: stok düşer, tükenince status=inactive olur → ürün
    //   listelerde "stokta yok" olarak sona kayar; sıralama/görünürlük değişir.
    // Membership siparişleri ürün listelerini etkilemez.
    if (!isMembershipOrder) {
      await this.cache.delPattern('products:list:*').catch(() => {});
    }

    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;

        // Check if this is a guest order and get actual buyer info
        const isGuestOrder = resultOrder.buyer.email === 'guest@tarodan.system' || shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? (shippingAddressData?.guestEmail || shippingAddressData?.email || resultOrder.buyer.email)
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
          : (resultOrder.buyer.displayName || resultOrder.buyer.email);

        this.logger.log(`Emitting order.paid event - buyerEmail: ${actualBuyerEmail}, isGuest: ${isGuestOrder}`);

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName: resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
        });

        this.logger.log(`order.paid event emitted for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to emit order.paid event: ${error}`);
      }
    }

    // Generate and send invoice to buyer (only for regular product orders, not membership/boost)
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        await this.invoiceService.generateAndSendInvoice(resultOrder.id);
        this.logger.log(`Invoice generated and sent for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    // Auto-create Shipment record (Sürat Kargo gönderi kaydı oluşturuldu at order creation)
    // Membership/boost sanal sipariştir → kargo kaydı oluşturma.
    if (!isMembershipOrder && !isBoostOrder) {
      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);

          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              // Sürat'a OzelKargoTakipNo olarak sipariş numarası gönderiliyor; aynısını
              // takip numarası olarak DB'ye de yazıyoruz ki UI'da gösterilsin.
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(`Auto-created shipment for order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`);
        }
      } catch (error) {
        this.logger.error(`Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    return true;
  }

  /**
   * Grup ödemesi başarı işleme: gruptaki TÜM siparişler tek transaction'da
   * preparing'e çekilir, sonra ürün başına stok düşümü + stockout kaskadı yapılır.
   * Sıralama kritik: kaskad (invalidatePendingOrdersForProduct) yalnızca
   * pending_payment siparişleri iptal eder — kardeşler önce preparing yapılırsa
   * kaskad onlara dokunamaz.
   */
  private async processSuccessfulGroupPayment(payment: any, transactionId?: string): Promise<boolean> {
    const cancelledOrders: {
      orderId: string;
      buyerId: string;
      productId: string;
      productTitle: string;
      offerId: string | null;
      hadPayment: boolean;
    }[] = [];
    const cancelledOffers: { buyerId: string; productId: string; productTitle: string }[] = [];
    let stockoutCategoryId: string | null = null;

    const result = await this.prisma.$transaction(
      async (tx) => {
        const oldStatus = payment.status;
        const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
          action: 'payment.completed',
          timestamp: new Date().toISOString(),
          oldStatus,
          newStatus: PaymentStatus.completed,
          transactionId: transactionId || payment.providerPaymentId,
        });

        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.completed,
            paidAt: new Date(),
            providerPaymentId: transactionId || payment.providerPaymentId,
            metadata: { ...((payment.metadata as any) || {}), auditHistory } as object,
          },
        });
        if (claimed.count === 0) {
          return null;
        }

        const groupOrders = await tx.order.findMany({
          where: { checkoutGroupId: payment.checkoutGroupId },
          include: { buyer: true, seller: true, product: true },
        });

        // Cron yarışı: callback uçuştayken iptal edilen siparişler kısmi otomatik iadeye gider
        const aliveOrders = groupOrders.filter((o) => o.status === OrderStatus.pending_payment);
        const refundOrders = groupOrders.filter((o) => o.status === OrderStatus.cancelled);

        const preparingDays = parseInt(
          this.configService.get('PREPARING_DEADLINE_DAYS') || '3',
          10,
        );
        const preparingDeadline = new Date();
        preparingDeadline.setDate(preparingDeadline.getDate() + preparingDays);

        // 1. geçiş: TÜM canlı siparişler preparing — stockout kaskadından önce
        for (const order of aliveOrders) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.preparing,
              preparingDeadline,
              version: { increment: 1 },
            },
          });
        }

        const productIdsToInvalidate: string[] = [];

        // 2. geçiş: ürün başına stok düşümü + stockout kaskadı + hold + ledger
        for (const order of aliveOrders) {
          productIdsToInvalidate.push(order.productId);
          // Bulgu E: ürün satırını FOR UPDATE ile kilitle (regular path ile aynı savunma).
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id: order.productId },
          });
          if (!product) {
            throw new Error(`Product not found for group order ${order.id}`);
          }

          // Adet bazlı stok düşümü: sipariş adedi kadar quantity-- ve reserved--.
          const orderQty = order.quantity ?? 1;
          const newQuantity =
            product.quantity !== null ? Math.max(0, product.quantity - orderQty) : null;
          const updateData: any = {
            status: getProductStatusFromQuantity(newQuantity),
            reservedQuantity: safeDecrementReserved(product.reservedQuantity, orderQty),
          };
          if (product.quantity !== null) {
            // Clamp'li mutlak set (FOR UPDATE altında yarışsız) — negatif stok imkânsız.
            updateData.quantity = newQuantity;
          }
          await tx.product.update({
            where: { id: order.productId },
            data: updateData,
          });

          const refreshed = await tx.product.findUnique({
            where: { id: order.productId },
            select: { quantity: true, reservedQuantity: true, categoryId: true },
          });
          // Gate on PHYSICAL stock (quantity <= 0), not available-for-new-buyers
          // (quantity - reservedQuantity). reservedQuantity still includes other
          // buyers' valid pending_payment orders, each with a real unit waiting;
          // gating on (q-r) would wrongly cancel + auto-refund them whenever
          // stock > 1 and buyers checked out concurrently. See the direct-buy
          // branch above for the detailed 2-stock/2-buyer walkthrough.
          if (refreshed && refreshed.quantity !== null && refreshed.quantity <= 0) {
            stockoutCategoryId = refreshed.categoryId ?? null;
            const orderResult = await this.productLockService.invalidatePendingOrdersForProduct(
              tx,
              order.productId,
              'Stok tükendi',
            );
            const offerResult = await this.productLockService.invalidateRelatedOffers(
              tx,
              order.productId,
            );
            cancelledOrders.push(
              ...orderResult.cancelledOrders.map((o) => ({
                orderId: o.orderId,
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
                offerId: o.offerId,
                hadPayment: o.hadPayment,
              })),
            );
            cancelledOffers.push(
              ...offerResult.rejectedOffers.map((o) => ({
                buyerId: o.buyerId,
                productId: o.productId,
                productTitle: o.productTitle,
              })),
            );
          }

          // Satıcı başına escrow hold (tek payment'a sipariş başına bir hold).
          // releaseAt teslimde hesaplanır (deliveredAt + return + grace); ödeme
          // anında null → teslim olmadan asla serbest bırakılmaz.
          const sellerAmount = Number(order.totalAmount) - Number(order.commissionAmount);
          await tx.paymentHold.create({
            data: {
              paymentId: payment.id,
              orderId: order.id,
              sellerId: order.sellerId,
              amount: sellerAmount,
              status: PaymentHoldStatus.held,
              releaseAt: null,
            },
          });

          await this.commissionLedger.upsertPending({
            orderId: order.id,
            sellerCommission: order.commissionAmount,
            buyerFee: order.buyerFeeAmount,
            tx,
          });
        }

        return { aliveOrders, refundOrders, productIdsToInvalidate };
      },
      { timeout: 60000 },
    );

    if (!result) {
      this.logger.log(
        `processSuccessfulGroupPayment: payment ${payment.id} already completed — skipping duplicate`,
      );
      return false;
    }

    // Cron yarışıyla iptal edilmiş siparişler: kısmi otomatik iade
    for (const order of result.refundOrders) {
      this.logger.warn(
        `Group payment ${payment.id} succeeded but order ${order.id} (${order.orderNumber}) already cancelled. Partial auto-refund.`,
      );
      try {
        await this.processRefund(order.id, Number(order.totalAmount));
        this.logger.log(`Partial auto-refund completed for group order ${order.id}`);
      } catch (refundError: any) {
        this.logger.error(
          `PARTIAL AUTO-REFUND FAILED for group order ${order.id}: ${refundError.message}. MANUAL INTERVENTION REQUIRED.`,
        );
      }
    }

    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }
    await this.cache.delPattern('products:list:*').catch(() => {});

    // Stockout kaskad bildirimleri (tx sonrası; tek bildirimle alıcı başına)
    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        : this.notificationService.notifyOrderCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId);
      await notify.catch((err) =>
        this.logger.warn(`stockout-notify failed for ${o.buyerId}: ${err.message}`),
      );
    }
    // Sipariş iptali e-postaları (alıcı+satıcı) — sipariş bazlı; teklif
    // iptallerini (isUnpaidOffer) ve mükerrer order'ları atla.
    const emailedCancelledOrders = new Set<string>();
    for (const o of cancelledOrders) {
      if (o.offerId !== null && !o.hadPayment) continue;
      if (emailedCancelledOrders.has(o.orderId)) continue;
      emailedCancelledOrders.add(o.orderId);
      await this.notificationService.sendOrderCancelledEmails(o.orderId);
    }
    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, stockoutCategoryId)
        .catch((err) =>
          this.logger.warn(`stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`),
        );
    }

    // ALICI tarafı: çoklu-ürün (sepet) ödemesinde CheckoutGroup başına TEK onay
    // maili + TEK push. Sipariş başına emitOrderPaid (skipBuyer:true) yalnız satıcı
    // tarafını işler; alıcı onayı burada bir kez üst seviyeden gönderilir.
    if (result.aliveOrders.length > 0) {
      try {
        const firstOrder = result.aliveOrders[0];
        const firstAddr = firstOrder.shippingAddress as any;
        const groupIsGuest =
          firstOrder.buyer.email === 'guest@tarodan.system' || firstAddr?.isGuestOrder;
        const groupBuyerEmail = groupIsGuest
          ? (firstAddr?.guestEmail || firstAddr?.email || firstOrder.buyer.email)
          : firstOrder.buyer.email;
        const groupBuyerName = groupIsGuest
          ? (firstAddr?.guestName || firstAddr?.fullName || 'Misafir Müşteri')
          : (firstOrder.buyer.displayName || firstOrder.buyer.email);
        const group = await this.prisma.checkoutGroup.findUnique({
          where: { id: payment.checkoutGroupId },
          select: { groupNumber: true },
        });
        await this.eventService.emitGroupBuyerOrderPaid({
          checkoutGroupId: payment.checkoutGroupId,
          groupNumber: group?.groupNumber || payment.checkoutGroupId,
          buyerId: firstOrder.buyerId,
          buyerEmail: groupBuyerEmail,
          buyerName: groupBuyerName,
          groupTotal: result.aliveOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          items: result.aliveOrders.map((o) => ({
            productTitle: o.product.title,
            totalAmount: Number(o.totalAmount),
          })),
          shippingAddress: {
            fullName: firstAddr?.fullName || '',
            phone: firstAddr?.phone || '',
            address: firstAddr?.address || '',
            city: firstAddr?.city || '',
            district: firstAddr?.district || '',
            zipCode: firstAddr?.zipCode || '',
          },
          isGuestOrder: groupIsGuest,
          buyerSystemEmail: firstOrder.buyer.email || '',
          representativeOrderNumber: firstOrder.orderNumber,
        });
      } catch (error) {
        this.logger.error(`Failed to emit group buyer order.paid for payment ${payment.id}: ${error}`);
      }
    }

    // Sipariş başına: order.paid eventi (SATICI tarafı; alıcı atlanır), fatura, kargo kaydı
    for (const resultOrder of result.aliveOrders) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;
        const isGuestOrder =
          resultOrder.buyer.email === 'guest@tarodan.system' || shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? (shippingAddressData?.guestEmail || shippingAddressData?.email || resultOrder.buyer.email)
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
          : (resultOrder.buyer.displayName || resultOrder.buyer.email);

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName: resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
          // Sepet akışı: alıcı onayı grup başına tek kez gönderildi → burada atla.
          skipBuyer: true,
        });
      } catch (error) {
        this.logger.error(`Failed to emit order.paid event for group order ${resultOrder.id}: ${error}`);
      }

      try {
        await this.invoiceService.generateAndSendInvoice(resultOrder.id);
      } catch (error) {
        this.logger.error(`Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`);
      }

      try {
        const existingShipment = await this.prisma.shipment.findFirst({
          where: { orderId: resultOrder.id },
        });
        if (!existingShipment) {
          const estimatedDelivery = new Date();
          estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);
          await this.prisma.shipment.create({
            data: {
              orderId: resultOrder.id,
              provider: 'surat',
              status: 'pending',
              trackingNumber: resultOrder.orderNumber,
              cost: Number(resultOrder.shippingCost),
              estimatedDelivery,
            },
          });
          this.logger.log(
            `Auto-created shipment for group order ${resultOrder.orderNumber} tracking=${resultOrder.orderNumber}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to auto-create shipment for order ${resultOrder.orderNumber}: ${error}`);
      }
    }

    this.logger.log(
      `Group payment ${payment.id} completed: ${result.aliveOrders.length} orders preparing, ${result.refundOrders.length} auto-refunded`,
    );
    return true;
  }

  /**
   * Ödeme başarısız/iptal olduğunda rezervasyonu kaldır, siparişi iptal et.
   * Offer-based orderlarda teklif status'u payment_expired yapılır (tekrar ödenebilir).
   */
  private async releaseProductForFailedPayment(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          productId: true,
          offerId: true,
          quantity: true,
          reservationReleasedAt: true,
        },
      });
      if (!order || order.status !== OrderStatus.pending_payment || !order.productId) return;

      const before = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { quantity: true, reservedQuantity: true, title: true, status: true },
      });
      const beforeAvailable = (before?.quantity ?? 0) - (before?.reservedQuantity ?? 0);

      // GUARD (Bulgu I): 5dk cron (releaseExpiredOrderReservations) rezervi ZATEN
      // bıraktıysa (reservationReleasedAt dolu) burada TEKRAR bırakmayız — yoksa
      // eşzamanlı başka alıcının canlı rezervini "çalarız". Sipariş/teklif iptali
      // yine yapılır; yalnız reservedQuantity decrement'i atlanır.
      const alreadyReleased = order.reservationReleasedAt !== null;
      const updateData: { reservedQuantity?: number; status?: ProductStatus } = {};
      if (before && !alreadyReleased) {
        // Adet bazlı: rezervasyonu sipariş adedi kadar serbest bırak (1 değil).
        const newReserved = safeDecrementReserved(
          before.reservedQuantity,
          order.quantity ?? 1,
        );
        updateData.reservedQuantity = newReserved;
        if (before.status === ProductStatus.reserved && newReserved === 0) {
          updateData.status = ProductStatus.active;
        }
      }

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.cancelled,
            // İlk kez burada bırakıyorsak işaretle (idempotency / çift-bırakma koruması).
            ...(alreadyReleased ? {} : { reservationReleasedAt: new Date() }),
          },
        }),
        ...(before && Object.keys(updateData).length > 0
          ? [
              this.prisma.product.update({
                where: { id: order.productId },
                data: updateData,
              }),
            ]
          : []),
        // Offer-based ise: payment_expired yap (tekrar ödenebilir)
        ...(order.offerId
          ? [
              this.prisma.offer.update({
                where: { id: order.offerId },
                data: { status: OfferStatus.payment_expired },
              }),
            ]
          : []),
      ]);
      this.logger.log(`Order ${orderId} cancelled and product ${order.productId} reservation released after payment failure`);
      await this.cache.del(`products:detail:${order.productId}`);

      // BACK_IN_STOCK dispatch: only when availability transitioned from <=0 to >0.
      const after = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { quantity: true, reservedQuantity: true },
      });
      const afterAvailable = (after?.quantity ?? 0) - (after?.reservedQuantity ?? 0);
      if (beforeAvailable <= 0 && afterAvailable > 0 && before?.title) {
        await this.dispatchBackInStock(order.productId, before.title).catch((err: any) =>
          this.logger.warn(`back-in-stock dispatch failed: ${err?.message}`),
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to release product for order ${orderId}: ${error?.message}`);
    }
  }

  /**
   * Notify all wishlist users for a product that just transitioned from
   * unavailable -> available. Debounced 24h per (userId, productId) so
   * repeated payment failures don't spam wishlists.
   */
  private async dispatchBackInStock(productId: string, productTitle: string): Promise<void> {
    // Delegated to NotificationService.broadcastBackInStock — kept here only
    // as a thin wrapper to preserve the existing call site contract.
    return this.notificationService.broadcastBackInStock(productId, productTitle);
  }


  /**
   * Process failed payment
   */
  private async processFailedPayment(payment: any, reason: string) {
    const oldStatus = payment.status;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });

    // Trade cash payments don't have order/product to release
    if (payment.tradeCashPaymentId && !payment.orderId) {
      this.logger.warn(`Trade cash payment ${payment.id} failed: ${reason}`);
      return;
    }

    // Grup ödemesi: gruptaki tüm siparişleri iptal et, rezervasyonları + Sürat gönderilerini bırak
    if (payment.checkoutGroupId && !payment.orderId) {
      const groupOrders = await this.prisma.order.findMany({
        where: { checkoutGroupId: payment.checkoutGroupId },
        include: {
          buyer: { select: { id: true, email: true, displayName: true } },
        },
      });

      for (const order of groupOrders) {
        await this.releaseProductForFailedPayment(order.id);
        await this.cancelSuratShipmentIfExists(order.id, order.orderNumber);

        try {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(order.totalAmount),
            provider: payment.provider,
            failureReason: reason,
          });
        } catch (error) {
          this.logger.error(`Failed to emit payment.failed event for group order ${order.id}: ${error}`);
        }
      }

      await this.logPaymentAction('failed', payment.id, undefined, undefined, oldStatus, PaymentStatus.failed, {
        reason,
        checkoutGroupId: payment.checkoutGroupId,
      });

      this.logger.warn(`Group payment ${payment.id} failed: ${reason} (${groupOrders.length} orders released)`);
      return;
    }

    // Siparişi iptal et ve ürünü tekrar satışa aç (ilanlar listesinde görünsün)
    if (payment.orderId) {
      await this.releaseProductForFailedPayment(payment.orderId);

      // Cancel any auto-created Surat shipment for this failed order
      const order = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: { orderNumber: true },
      });
      if (order) {
        await this.cancelSuratShipmentIfExists(payment.orderId, order.orderNumber);
      }
    }

    // Log payment failure
    await this.logPaymentAction('failed', payment.id, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason,
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);

    // Emit payment.failed event
    try {
      if (payment.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: payment.orderId },
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        });

        if (order) {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(payment.amount),
            provider: payment.provider,
            failureReason: reason,
          });

          this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
        }
      }
    } catch (error) {
      // Log but don't fail - payment was already marked as failed
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }
  }

  /**
   * Handle successful trade cash payment separately from order payments.
   * Updates TradeCashPayment status to completed; does NOT touch orders/products.
   *
   * Safe-trade (escrow) flow: if the associated Trade is in `awaiting_payment`,
   * transition it to `shipping_to_warehouse` and set the shipping deadline.
   */
  private async processSuccessfulTradeCashPayment(payment: any, transactionId?: string): Promise<boolean> {
    // Platform ayarı: takas kargo süresi (gün). Varsayılan 7 gün.
    const shippingDaysSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'trade_shipping_deadline_days' },
    });
    const shippingDays = parseInt(shippingDaysSetting?.settingValue ?? '7', 10) || 7;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return { didComplete: false } as const;
      }

      const tcp = await tx.tradeCashPayment.update({
        where: { id: payment.tradeCashPaymentId },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });

      // Safe-trade geçişi: awaiting_payment -> shipping_to_warehouse
      const trade = await tx.trade.findUnique({ where: { id: tcp.tradeId } });
      let tradeTransitioned = false;
      let shippingDeadline: Date | null = null;

      if (trade && trade.status === TradeStatus.awaiting_payment) {
        const now = new Date();
        shippingDeadline = new Date(now);
        shippingDeadline.setDate(shippingDeadline.getDate() + shippingDays);

        await tx.trade.update({
          where: { id: trade.id, version: trade.version },
          data: {
            status: TradeStatus.shipping_to_warehouse,
            shippingDeadline,
            version: { increment: 1 },
          },
        });

        // Etiketler + Sürat sevkiyatı tx SONRASI tek kaynaktan
        // (TradeService.createInboundTradeShipments) yapılır — aşağıda çağrılıyor.
        tradeTransitioned = true;
      }

      return {
        didComplete: true,
        tradeTransitioned,
        trade,
        shippingDeadline,
      } as const;
    });

    if (!result.didComplete) {
      return false;
    }

    this.logger.log(`Trade cash payment ${payment.id} completed (tradeCashPaymentId=${payment.tradeCashPaymentId})`);

    // İşlem tamamlandıktan sonra bildirim emit et (her iki tarafa)
    if (result.tradeTransitioned && result.trade && result.shippingDeadline) {
      try {
        await this.eventService.emitTradeReadyForShipping({
          tradeId: result.trade.id,
          initiatorId: result.trade.initiatorId,
          receiverId: result.trade.receiverId,
          shippingDeadline: result.shippingDeadline,
        });
        this.logger.log(
          `trade.ready-for-shipping event emitted for trade ${result.trade.id}`,
        );
      } catch (error) {
        // Log but don't fail - payment was already completed
        this.logger.error(`Failed to emit trade.ready-for-shipping event: ${error}`);
      }

      // Auto-create the two `to_warehouse` Sürat shipments now that the cash
      // trade has cleared payment and entered `shipping_to_warehouse`. Mirrors
      // the non-cash hook in TradeService.acceptTrade. We resolve TradeService
      // lazily via ModuleRef + a runtime require to avoid the Trade<>Payment
      // module circular import (Membership eagerly imports Payment; Trade
      // imports Payment; Payment can't statically import Trade).
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TradeService } = require('../trade/trade.service');
        const tradeService = this.moduleRef.get(TradeService, { strict: false });
        if (tradeService && typeof tradeService.createInboundTradeShipments === 'function') {
          tradeService.createInboundTradeShipments(result.trade.id).catch((err: any) =>
            this.logger.error(
              `createInboundTradeShipments crashed for cash-trade ${result.trade!.id}: ${err?.message ?? err}`,
            ),
          );
        } else {
          this.logger.warn(
            `TradeService.createInboundTradeShipments not available; inbound shipments NOT auto-created for cash-trade ${result.trade.id}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to resolve TradeService for cash-trade inbound shipments: ${err?.message ?? err}`,
        );
      }
    }

    return true;
  }

  /**
   * Retry a failed payment
   * Creates a new payment for the same order
   */
  async retryPayment(paymentId: string, userId: string, req?: Request) {
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
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Grup ödemesi retry'ı initiate üzerinden yapılır (payment satırı yeniden kullanılır)
    if (!payment.order) {
      throw new BadRequestException(
        'Bu ödeme bir sipariş grubuna ait. Lütfen ödemeyi sipariş grubuyla yeniden başlatın.',
      );
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi tekrar deneme yetkiniz yok');
    }

    // Only allow retrying failed payments
    if (payment.status !== PaymentStatus.failed) {
      throw new BadRequestException('Sadece başarısız ödemeler tekrar denenebilir');
    }

    const order = payment.order;
    const wasCancelled = order.status === OrderStatus.cancelled;

    // Sipariş iptal edilmişse (ödeme başarısız sonrası): ürün hâlâ aktifse siparişi yeniden açıp rezerve et
    if (wasCancelled && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });
      if (!product || product.status !== ProductStatus.active) {
        throw new BadRequestException(
          'Ürün artık satışta değil veya başka alıcıya satıldı. Lütfen ilanlar sayfasından tekrar sipariş oluşturun.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.pending_payment },
        }),
        this.prisma.product.update({
          where: { id: order.productId },
          data: { status: ProductStatus.reserved },
        }),
      ]);
      // Reload order with relations for payment init
      (payment as any).order = await this.prisma.order.findUnique({
        where: { id: order.id },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });
    } else if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Sipariş durumu ödeme tekrarına uygun değil');
    }

    // Create new payment record
    const newPayment = await this.prisma.payment.create({
      data: {
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        status: PaymentStatus.pending,
        metadata: {
          retriedFrom: paymentId,
          retriedAt: new Date().toISOString(),
          auditHistory: [{
            action: 'payment.retried',
            timestamp: new Date().toISOString(),
            originalPaymentId: paymentId,
            userId,
          }],
        },
      },
    });

    // Log retry action on original payment
    await this.logPaymentAction('retried', paymentId, payment.orderId, undefined, PaymentStatus.failed, undefined, {
      newPaymentId: newPayment.id,
      userId,
    });

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin), kart /payments/process-direct ile.
    await this.assignMerchantOid(newPayment.id, String(order.orderNumber || order.id));

    this.logger.log(`Payment ${paymentId} retried, new payment ${newPayment.id} created`);

    return {
      success: true,
      paymentId: payment.id,
      newPaymentId: newPayment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      provider: payment.provider,
      expiresIn: 300,
    };
  }

  /**
   * Cancel a pending payment
   * Only allows canceling pending payments
   */
  async cancelPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
            seller: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Grup ödemesi: erişim grup üzerinden doğrulanır, tüm siparişler bırakılır
    if (!payment.order && payment.checkoutGroupId) {
      const group = await this.prisma.checkoutGroup.findUnique({
        where: { id: payment.checkoutGroupId },
        select: { buyerId: true },
      });
      if (!group || group.buyerId !== userId) {
        throw new ForbiddenException('Bu ödemeyi iptal etme yetkiniz yok');
      }
      if (payment.status !== PaymentStatus.pending) {
        throw new BadRequestException('Sadece bekleyen ödemeler iptal edilebilir');
      }
      await this.processFailedPayment(payment, 'Kullanıcı tarafından iptal edildi');
      this.logger.log(`Group payment ${paymentId} cancelled by user ${userId}`);
      return {
        success: true,
        paymentId: payment.id,
        message: 'Ödeme başarıyla iptal edildi',
      };
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi iptal etme yetkiniz yok');
    }

    // Only allow canceling pending payments
    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException('Sadece bekleyen ödemeler iptal edilebilir');
    }

    const oldStatus = payment.status;

    // Update payment status to failed
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      },
    });

    // Siparişi iptal et ve ürünü tekrar satışa aç
    await this.releaseProductForFailedPayment(payment.orderId);

    this.logger.log(`Payment ${paymentId} cancelled by user ${userId}`);

    // Log payment cancellation
    await this.logPaymentAction('cancelled', paymentId, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason: 'Kullanıcı tarafından iptal edildi',
      userId,
    });

    // Emit payment.failed event
    try {
      await this.eventService.emitPaymentFailed({
        paymentId: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        buyerId: payment.order.buyerId,
        buyerEmail: payment.order.buyer.email,
        buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
        amount: Number(payment.amount),
        provider: payment.provider,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      });

      this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
    } catch (error) {
      // Log but don't fail - payment was already cancelled
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }

    return {
      success: true,
      paymentId: payment.id,
      message: 'Ödeme başarıyla iptal edildi',
    };
  }

  /**
   * Kullanıcı ödeme fail sayfasına geldiğinde çağrılır. PayTR callback bazen ulaşmayabiliyor;
   * bu endpoint ile ürün rezervasyonu hemen serbest bırakılır (ilan tekrar listelerde görünür).
   * Sadece status=pending ise işlem yapılır; idempotent.
   */
  async confirmFailedFromClient(paymentId: string): Promise<{ released: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.pending) {
      return { released: false };
    }
    await this.processFailedPayment(payment, 'Fail sayfasından onay - rezervasyon serbest bırakıldı');
    return { released: true };
  }

  /**
   * Success sayfasından çağrılır: PayTR durum-sorgu API'sini hemen çalıştırır,
   * ödeme tamamsa siparişi anında tamamlar (callback gelmesini beklemeden).
   * Public, idempotent: payment zaten completed ise { completed: true } döner.
   */
  async verifyPaymentFromClient(
    paymentId: string,
  ): Promise<{ completed: boolean; status: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: { include: { buyer: true, seller: true, product: true } },
        tradeCashPayment: true,
      },
    });

    if (!payment) {
      return { completed: false, status: 'not_found' };
    }

    if (payment.status === PaymentStatus.completed) {
      return { completed: true, status: 'already_completed' };
    }

    if (payment.status !== PaymentStatus.pending) {
      return { completed: false, status: payment.status };
    }

    if (payment.provider !== 'paytr') {
      return { completed: false, status: 'unsupported_provider' };
    }

    const oid = (payment.providerConversationId || '').trim();
    if (!oid) {
      return { completed: false, status: 'no_provider_oid' };
    }

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(oid.replace(/-/g, ''));
    }

    if (!inquiry.ok) {
      return { completed: false, status: 'paytr_not_found' };
    }

    // O16: Tolerans eşiğini tüm yollarda BİRLEŞTİR (eskiden burada 0.01, reconcile/mismatch'te
    // 0.05 idi → aynı ödeme için tutarsız kabul/ret). Tek config: PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL.
    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.warn(
        `verifyPaymentFromClient amount mismatch payment=${payment.id} oid=${oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return { completed: false, status: 'amount_mismatch' };
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ''
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.processSuccessfulPayment(payment, txnRef);
    if (did) {
      this.logger.log(`verifyPaymentFromClient completed payment=${payment.id} oid=${oid}`);
      return { completed: true, status: 'completed_now' };
    }
    return { completed: false, status: 'process_skipped' };
  }

  // Taşındı: payment-refund.service.ts — iade/escrow serbest bırakma (facade delege; imzalar aynı).

  async processRefund(
    orderId: string,
    refundAmount?: number,
    opts?: { skipRefundEvent?: boolean; refundQuantity?: number },
  ) {
    return this.paymentRefund.processRefund(orderId, refundAmount, opts);
  }

  async refundTradeCashPaymentIfCompleted(tradeId: string): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    return this.paymentRefund.refundTradeCashPaymentIfCompleted(tradeId);
  }

  async releasePayment(orderId: string) {
    return this.paymentRefund.releasePayment(orderId);
  }

  async scheduleHoldReleaseOnDelivery(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    return this.paymentRefund.scheduleHoldReleaseOnDelivery(orderId, deliveredAt, tx);
  }

  async releaseHoldsDue(): Promise<{ count: number; tradeCashReleased: number }> {
    return this.paymentRefund.releaseHoldsDue();
  }

  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    return this.paymentRefund.releasePaymentIfHeld(orderId);
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async processRefundedOrders(): Promise<{ refunded: number; failed: number }> {
    return this.paymentReconciliation.processRefundedOrders();
  }

  // Taşındı: payment-query.service.ts — imza aynen korunuyor (facade delege).
  async findOrderParties(
    orderId: string,
  ): Promise<{ buyerId: string; sellerId: string } | null> {
    return this.paymentQuery.findOrderParties(orderId);
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async syncSavedCardsFromUtoken(
    userId: string,
    utoken: string,
    mandate?: { ip?: string; termsVersion?: string },
  ): Promise<number> {
    return this.paymentReconciliation.syncSavedCardsFromUtoken(userId, utoken, mandate);
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async reconcileMissingInvoices(): Promise<{ generated: number }> {
    return this.paymentReconciliation.reconcileMissingInvoices();
  }

  // Taşındı: payment-query.service.ts — imzalar aynen korunuyor (facade delege).

  async getPaymentStatusUnified(paymentId: string, userId: string | null) {
    return this.paymentQuery.getPaymentStatusUnified(paymentId, userId);
  }

  async getPaymentStatus(paymentId: string, userId: string) {
    return this.paymentQuery.getPaymentStatus(paymentId, userId);
  }

  async getGuestPaymentStatus(paymentId: string) {
    return this.paymentQuery.getGuestPaymentStatus(paymentId);
  }

  async findOne(paymentId: string, userId: string) {
    return this.paymentQuery.findOne(paymentId, userId);
  }

  async getSellerHolds(sellerId: string) {
    return this.paymentQuery.getSellerHolds(sellerId);
  }

  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      provider?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    return this.paymentQuery.getUserPayments(userId, options);
  }

  /**
   * PayTR callback sunucuya ulaşmadan ödeme başarılı olduysa: durum-sorgu ile doğrula ve tamamla (1.4).
   * PAYTR_RECONCILIATION_ENABLED=false ile kapatılabilir.
   */
  async reconcilePendingPaytrPayments(): Promise<{ checked: number; completed: number }> {
    const enabled = this.configService.get('PAYTR_RECONCILIATION_ENABLED');
    if (enabled === 'false' || enabled === '0') {
      return { checked: 0, completed: 0 };
    }

    const minAgeMin = parseInt(
      this.configService.get('PAYTR_RECONCILIATION_MIN_AGE_MINUTES') || '3',
      10,
    );
    const batch = parseInt(this.configService.get('PAYTR_RECONCILIATION_BATCH_LIMIT') || '40', 10);
    const tolerance = parseFloat(this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05');

    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minAgeMin);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: 'paytr',
        status: PaymentStatus.pending,
        providerConversationId: { not: null },
        OR: [
          { order: { status: OrderStatus.pending_payment } },
          // Grup ödemesi: gruptaki en az bir sipariş hâlâ ödeme bekliyorsa
          { checkoutGroup: { orders: { some: { status: OrderStatus.pending_payment } } } },
        ],
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
      },
      take: batch,
      orderBy: { createdAt: 'asc' },
    });

    let checked = 0;
    let completed = 0;

    for (const row of candidates) {
      checked++;
      const oid = row.providerConversationId as string;
      try {
        const inquiry = await this.paytrService.queryPaymentStatus(oid);
        if (!inquiry.ok) {
          continue;
        }

        const ourAmount = Number(row.amount);
        if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
          // O10: tutar uyuşmazlığını ALARM (error) olarak logla — sessizce atlamak yerine
          // operasyon ekibinin görmesi için yüksek-öncelik. Ödeme completed yapılmaz.
          this.logger.error(
            `ALARM: PayTR reconcile tutar uyuşmazlığı — payment=${row.id} oid=${oid} ` +
              `paytr=${inquiry.paymentTotalTl} ours=${ourAmount}. Ödeme tamamlanmadı, manuel inceleme gerekir.`,
          );
          continue;
        }

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            checkoutGroup: {
              include: { orders: { select: { status: true } } },
            },
            tradeCashPayment: true,
          },
        });

        const orderStillPayable = full?.orderId
          ? full.order?.status === OrderStatus.pending_payment
          : full?.checkoutGroup?.orders.some((o) => o.status === OrderStatus.pending_payment) ?? false;

        if (!full || full.status !== PaymentStatus.pending || !orderStillPayable) {
          continue;
        }

        const txnRef =
          inquiry.paymentDate != null && inquiry.paymentDate !== ''
            ? `paytr:${oid}:${inquiry.paymentDate}`
            : `paytr:${oid}`;

        const did = await this.processSuccessfulPayment(full, txnRef);
        if (did) {
          completed++;
          this.logger.log(`PayTR reconcile completed payment ${row.id} oid=${oid}`);
        }
      } catch (error: any) {
        this.logger.error(`PayTR reconcile failed payment ${row.id}: ${error?.message}`);
      }
    }

    return { checked, completed };
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    return this.paymentReconciliation.releaseExpiredOrderReservations();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async reconcileReservedQuantities(): Promise<{ count: number }> {
    return this.paymentReconciliation.reconcileReservedQuantities();
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async expireUnpaidOrders(): Promise<{ count: number }> {
    return this.paymentReconciliation.expireUnpaidOrders();
  }

  /**
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    // H1: Ödeme SATIRINI `failed` yapma penceresi, REZERVASYON serbest bırakma
    // penceresinden (PAYMENT_TIMEOUT_MINUTES=5dk) AYRIDIR ve PayTR 3DS oturumundan
    // (createDirectPayment timeout_limit=30dk) MUTLAKA UZUN olmalıdır.
    // Aksi halde: kullanıcı 3DS'i 5-30dk arası tamamlar → PayTR parayı çeker →
    // callback gelir ama bu cron payment'ı çoktan `failed` yapmıştır → CAS düşer →
    // çekilen para sipariş'e bağlanmaz, iade yok (orphan capture). Pencereyi
    // PayTR oturum süresi + grace üstüne çekerek bu yarışı kökten kapatıyoruz.
    // Stok zaten 5dk'da releaseExpiredOrderReservations ile boşaldığı için bu
    // gecikme stok'u bağlamaz; sadece terk edilen payment satırı daha geç failed olur.
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_FAIL_TIMEOUT_MINUTES') || '35',
      10,
    );
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);

    // H2 self-heal: `processing` claim'i normalde çekim süresince (saniyeler) tutulur ve
    // processDirectPayment finally'sinde `pending`'e döner. Süreç çekim ortasında çökerse
    // (hard kill) claim `processing`'de takılı kalır. 5dk'dan eski `processing` ödemeleri
    // `pending`'e döndürerek yeniden denenebilir/işlenebilir hale getir (callback CAS pending bekler).
    const staleProcessing = new Date();
    staleProcessing.setMinutes(staleProcessing.getMinutes() - 5);
    await this.prisma.payment.updateMany({
      where: { status: PaymentStatus.processing, updatedAt: { lt: staleProcessing } },
      data: { status: PaymentStatus.pending },
    });

    // Find pending payments older than timeout
    const expiredPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        createdAt: {
          lt: timeoutDate,
        },
      },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        },
        checkoutGroup: {
          include: {
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentExpiresAt: true,
              },
            },
          },
        },
      },
    });

    let cancelledCount = 0;

    for (const payment of expiredPayments) {
      try {
        // Trade cash vb. siparişsiz/grupsuz ödemeleri bu cron'da atlama (eski davranış order'a bağlıydı)
        if (!payment.order && !payment.checkoutGroup) {
          continue;
        }

        // Split-window contract: if the parent order is still in pending_payment
        // and its 24h paymentExpiresAt has not yet passed, only fail the Payment
        // row. The order stays alive so the buyer can hit initiate again and a
        // new Payment row is created. The 30-min reservation cron and the 24h
        // kill-switch handle stock + order state independently.
        // Grup ödemesi: gruptaki HERHANGİ bir sipariş canlıysa ödeme yeniden başlatılabilir.
        const now = new Date();
        const orderStillAlive = payment.order
          ? payment.order.status === OrderStatus.pending_payment &&
            payment.order.paymentExpiresAt > now
          : payment.checkoutGroup!.orders.some(
              (o) => o.status === OrderStatus.pending_payment && o.paymentExpiresAt > now,
            );

        // H3: Atomik CAS — yalnızca HÂLÂ `pending` olan ödemeyi `failed` yap.
        // findMany (snapshot) ile bu update arasında gerçek bir başarı callback'i
        // ödemeyi `completed` yapmış olabilir; CAS'sız `update` bunu `failed`'a
        // ezerdi (TOCTOU → ödenmiş sipariş bozulur). count===0 ise ödeme bu turda
        // tamamlandı/işlendi demektir; stok/iade cleanup'ını ÇALIŞTIRMA, atla.
        const failedClaim = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.failed,
            failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
          },
        });
        if (failedClaim.count === 0) {
          continue;
        }

        if (!orderStillAlive) {
          // Order has been cancelled (or 24h passed): release stock + cleanup.
          if (payment.order) {
            await this.releaseProductForFailedPayment(payment.orderId);
            await this.cancelSuratShipmentIfExists(payment.orderId, payment.order.orderNumber);
          } else {
            for (const groupOrder of payment.checkoutGroup!.orders) {
              await this.releaseProductForFailedPayment(groupOrder.id);
              await this.cancelSuratShipmentIfExists(groupOrder.id, groupOrder.orderNumber);
            }
          }
        }

        // Emit payment.failed event (grup ödemesinde alıcı bilgisi sipariş bazında olmadığından atlanır; log yeterli)
        if (payment.order) {
          try {
            await this.eventService.emitPaymentFailed({
              paymentId: payment.id,
              orderId: payment.orderId,
              orderNumber: payment.order.orderNumber,
              buyerId: payment.order.buyerId,
              buyerEmail: payment.order.buyer.email,
              buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
              amount: Number(payment.amount),
              provider: payment.provider,
              failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
            });
          } catch (error) {
            // Log but don't fail
            this.logger.error(`Failed to emit payment.failed event for payment ${payment.id}: ${error}`);
          }
        }

        cancelledCount++;
        this.logger.log(
          `Cancelled expired payment ${payment.id} for ${payment.order ? `order ${payment.order.orderNumber}` : `group ${payment.checkoutGroupId}`}`,
        );
      } catch (error: any) {
        this.logger.error(`Failed to cancel expired payment ${payment.id}: ${error.message}`);
      }
    }

    return { count: cancelledCount };
  }

  // Taşındı: payment-reconciliation.service.ts — facade delege (imza aynı).
  async handleExpiredPreparingOrders(): Promise<{ warned: number; cancelled: number }> {
    return this.paymentReconciliation.handleExpiredPreparingOrders();
  }
}
