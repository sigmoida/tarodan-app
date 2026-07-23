import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { PaymentStatus, OrderStatus, ProductStatus } from "@prisma/client";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import type { PayTRStatusInquirySuccess } from "../payment-providers/paytr.service";
import { EventService } from "../events";
import { Request } from "express";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentProviderEventService } from "./payment-provider-event.service";
import { i18nMessage } from "../i18n";

@Injectable()
export class PaymentLifecycleService {
  private readonly logger = new Logger(PaymentLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly eventService: EventService,
    private readonly paymentCommon: PaymentCommonService,
    private readonly paymentFulfillment: PaymentFulfillmentService,
    // Gözlemlenebilirlik (best-effort). @Optional: verify'ı new(...) ile kuran birim
    // testleri recorder sağlamak zorunda kalmasın — record() zaten hiç fırlatmaz.
    @Optional()
    private readonly providerEvents?: PaymentProviderEventService,
  ) {}

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
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    // Grup ödemesi retry'ı initiate üzerinden yapılır (payment satırı yeniden kullanılır)
    if (!payment.order) {
      throw new BadRequestException(
        i18nMessage("server.payment.paymentBelongsToGroupRestart"),
      );
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.retryForbidden"),
      );
    }

    // Only allow retrying failed payments
    if (payment.status !== PaymentStatus.failed) {
      throw new BadRequestException(
        i18nMessage("server.payment.onlyFailedPaymentsRetryable"),
      );
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
          i18nMessage("server.payment.productNoLongerAvailable"),
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
      throw new BadRequestException(
        i18nMessage("server.payment.orderStatusNotRetryable"),
      );
    }

    // FLOW-H4: Payment.orderId @unique olduğundan aynı sipariş için YENİ payment.create
    // P2002 (unique violation) → 500 verir; retry HİÇ çalışmazdı. Bunun yerine mevcut
    // `failed` payment satırını CAS ile `pending`'e resetleyip YENİDEN KULLAN (initiation
    // reuse deseni). CAS (updateMany + status guard) eşzamanlı bir başka retry/callback
    // yarışını kapatır: yalnız bir çağıran failed→pending geçişini kazanır.
    const reclaimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.failed },
      data: { status: PaymentStatus.pending, providerPaymentId: null },
    });
    if (reclaimed.count === 0) {
      // Yarış: başka bir işlem bu ödemeyi zaten resetledi/tamamladı → tekrar deneme.
      throw new BadRequestException(
        i18nMessage("server.payment.onlyFailedPaymentsRetryable"),
      );
    }

    // Retry denetim izini metadata'ya ekle (mevcut metadata KORUNUR; updateMany JSON
    // merge edemediğinden ayrı bir read-modify-write). assignMerchantOid bundan sonra
    // bu taze metadata'yı okuyup merchantOidHistory'i üstüne merge eder.
    const prevMeta = (payment.metadata as Record<string, any>) || {};
    const auditHistory = Array.isArray(prevMeta.auditHistory)
      ? prevMeta.auditHistory
      : [];
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        metadata: {
          ...prevMeta,
          retriedAt: new Date().toISOString(),
          auditHistory: auditHistory.concat({
            action: "payment.retried",
            timestamp: new Date().toISOString(),
            originalPaymentId: paymentId,
            userId,
          }),
        },
      },
    });

    // Log retry action on the (reused) payment
    await this.paymentCommon.logPaymentAction(
      "retried",
      paymentId,
      payment.orderId,
      undefined,
      PaymentStatus.failed,
      PaymentStatus.pending,
      {
        reused: true,
        userId,
      },
    );

    // Ödeme niyeti (intent): merchant_oid ata (callback eşleşsin, eski oid history'e
    // taşınır), kart /payments/process-direct ile. providerPaymentId de sıfırlanır.
    await this.paymentCommon.assignMerchantOid(
      paymentId,
      String(order.orderNumber || order.id),
    );

    this.logger.log(
      `Payment ${paymentId} retried (row reused, reset failed→pending)`,
    );

    return {
      success: true,
      paymentId: payment.id,
      // Geriye dönük uyumluluk: satır yeniden kullanıldığından newPaymentId == paymentId.
      newPaymentId: payment.id,
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
      throw new NotFoundException(
        i18nMessage("server.payment.paymentNotFound"),
      );
    }

    // Grup ödemesi: erişim grup üzerinden doğrulanır, tüm siparişler bırakılır
    if (!payment.order && payment.checkoutGroupId) {
      const group = await this.prisma.checkoutGroup.findUnique({
        where: { id: payment.checkoutGroupId },
        select: { buyerId: true },
      });
      if (!group || group.buyerId !== userId) {
        throw new ForbiddenException(
          i18nMessage("server.payment.cancelPaymentForbidden"),
        );
      }
      if (payment.status !== PaymentStatus.pending) {
        throw new BadRequestException(
          i18nMessage("server.payment.onlyPendingPaymentsCancelable"),
        );
      }
      await this.paymentFulfillment.processFailedPayment(
        payment,
        "Kullanıcı tarafından iptal edildi",
      );
      this.logger.log(`Group payment ${paymentId} cancelled by user ${userId}`);
      return {
        success: true,
        paymentId: payment.id,
      };
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.payment.cancelPaymentForbidden"),
      );
    }

    // Only allow canceling pending payments
    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException(
        i18nMessage("server.payment.onlyPendingPaymentsCancelable"),
      );
    }

    const oldStatus = payment.status;

    // FLOW-M2: CAS — findUnique ile bu update arasında bir başarı callback'i ödemeyi
    // `completed` yapmış olabilir; KOŞULSUZ update bunu `failed`'a EZER (ödenmiş sipariş
    // iptal edilir, para askıda kalır). Yalnız hâlâ `pending` olanı `failed` yap;
    // count===0 → arada tamamlandı/değişti → iptal etme, ürünü serbest bırakma.
    const cancelled = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.pending },
      data: {
        status: PaymentStatus.failed,
        failureReason: "Kullanıcı tarafından iptal edildi",
      },
    });
    if (cancelled.count === 0) {
      throw new BadRequestException(
        i18nMessage("server.payment.onlyPendingPaymentsCancelable"),
      );
    }

    // Siparişi iptal et ve ürünü tekrar satışa aç
    await this.paymentFulfillment.releaseProductForFailedPayment(
      payment.orderId,
    );

    this.logger.log(`Payment ${paymentId} cancelled by user ${userId}`);

    // Log payment cancellation
    await this.paymentCommon.logPaymentAction(
      "cancelled",
      paymentId,
      payment.orderId,
      undefined,
      oldStatus,
      PaymentStatus.failed,
      {
        reason: "Kullanıcı tarafından iptal edildi",
        userId,
      },
    );

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
        failureReason: "Kullanıcı tarafından iptal edildi",
      });

      this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
    } catch (error) {
      // Log but don't fail - payment was already cancelled
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }

    return {
      success: true,
      paymentId: payment.id,
    };
  }

  /**
   * Kullanıcı ödeme fail sayfasına geldiğinde çağrılır. PayTR callback bazen ulaşmayabiliyor;
   * bu endpoint ile ürün rezervasyonu hemen serbest bırakılır (ilan tekrar listelerde görünür).
   * Sadece status=pending ise işlem yapılır; idempotent.
   */
  async confirmFailedFromClient(
    paymentId: string,
  ): Promise<{ released: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.pending) {
      return { released: false };
    }
    // SEC-M1: Bu uç PUBLIC ve idempotent (guest checkout fail sayfası da çağırır) —
    // sahiplik JWT ile doğrulanamaz. En kritik kötüye kullanımı kapat: CANLI bir 3DS
    // çekimi varken ödemeyi fail ETME. Aksi halde (a) kullanıcı erken "başarısız"
    // derse ya da (b) saldırgan payment-id enumerasyonuyla başkasının canlı ödemesini
    // fail ederse, PayTR çekimi tamamlanıp callback geldiğinde satır failed olur →
    // orphan capture (para çekildi, sipariş yok). Charge penceresi kapanınca (ya da
    // gerçek fail callback'iyle) normal akış devreye girer.
    const windowMin = parseInt(
      this.configService.get("PAYMENT_FAIL_TIMEOUT_MINUTES") || "35",
      10,
    );
    if (this.paymentCommon.isChargeLikelyLive(payment.metadata, windowMin)) {
      this.logger.warn(
        `confirmFailedFromClient: canlı 3DS çekimi var — fail atlandı payment=${paymentId}`,
      );
      return { released: false };
    }
    await this.paymentFulfillment.processFailedPayment(
      payment,
      "Fail sayfasından onay - rezervasyon serbest bırakıldı",
    );
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
      return { completed: false, status: "not_found" };
    }

    if (payment.status === PaymentStatus.completed) {
      return { completed: true, status: "already_completed" };
    }

    if (payment.status !== PaymentStatus.pending) {
      return { completed: false, status: payment.status };
    }

    if (payment.provider !== "paytr") {
      return { completed: false, status: "unsupported_provider" };
    }

    // FLOW-H1: Çift-çekim guard'ı TÜM oid'leri tarar (güncel + merchantOidHistory).
    // Re-init sonrası providerConversationId yeni oid'e döner ama capture ESKİ oid'de
    // olmuş olabilir; yalnız güncel oid'i sormak bunu kaçırır → çağıran ikinci kez çeker
    // (çift çekim). Herhangi bir oid'de çekilmiş capture bulursak ödemeyi tamamlayıp
    // "zaten ödendi" döneriz → ikinci çekim engellenir.
    const oids = this.paymentCommon.collectPaymentOids(payment);
    if (oids.length === 0) {
      return { completed: false, status: "no_provider_oid" };
    }

    // O16: Tolerans eşiğini tüm yollarda BİRLEŞTİR (tek config).
    const tolerance = parseFloat(
      this.configService.get("PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") || "0.05",
    );
    const ourAmount = Number(payment.amount);

    let capturedOid: string | null = null;
    let capturedInquiry: PayTRStatusInquirySuccess | null = null;
    let sawMismatch = false;
    for (const candidateOid of oids) {
      let inquiry = await this.paymentProviders
        .resolve()
        .queryPaymentStatus(candidateOid);
      if (!inquiry.ok && candidateOid.includes("-")) {
        inquiry = await this.paymentProviders
          .resolve()
          .queryPaymentStatus(candidateOid.replace(/-/g, ""));
      }
      if (!inquiry.ok) continue;
      // Bu oid PayTR'da çekilmiş. Tutar toleransı tutmuyorsa bu oid'i sayma ama
      // diğer oid'leri taramaya devam et (mismatch'i işaretle).
      if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
        this.logger.warn(
          `verifyPaymentFromClient amount mismatch payment=${payment.id} oid=${candidateOid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
        );
        sawMismatch = true;
        continue;
      }
      capturedOid = candidateOid;
      capturedInquiry = inquiry;
      break;
    }

    if (!capturedOid || !capturedInquiry) {
      return {
        completed: false,
        status: sawMismatch ? "amount_mismatch" : "paytr_not_found",
      };
    }

    const txnRef =
      capturedInquiry.paymentDate != null && capturedInquiry.paymentDate !== ""
        ? `paytr:${capturedOid}:${capturedInquiry.paymentDate}`
        : `paytr:${capturedOid}`;

    const did = await this.paymentFulfillment.processSuccessfulPayment(
      payment,
      txnRef,
      capturedOid, // FLOW-M5: çekilen oid'e senkronla
    );
    // Gözlemlenebilirlik: istemci-tetikli doğrulama, callback kaçırılmış bir ödemeyi
    // durum-sorgu ile buldu (çift-çekim guard'ı). Yalnız BULUNAN sorgu kaydedilir.
    await this.providerEvents?.record({
      eventType: "status_inquiry",
      merchantOid: capturedOid,
      paymentId: payment.id,
      status: "success",
      paymentType: capturedInquiry.paymentType ?? null,
      installmentCount: capturedInquiry.installmentCount ?? null,
      currency: capturedInquiry.currency ?? null,
      amount: ourAmount,
      totalAmount: capturedInquiry.paymentTotalTl,
      raw: {
        source: "verify",
        completed: did,
        paymentDate: capturedInquiry.paymentDate ?? null,
      },
    });
    if (did) {
      this.logger.log(
        `verifyPaymentFromClient completed payment=${payment.id} oid=${capturedOid}`,
      );
      return { completed: true, status: "completed_now" };
    }
    return { completed: false, status: "process_skipped" };
  }
}
