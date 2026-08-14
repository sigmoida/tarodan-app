import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  OrderStatus,
  Prisma,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  PAYMENT_CONFIG_KEYS,
  envConfigNumber,
} from "../payment/helpers/payment.constants";
import { PaymentService } from "../payment/payment.service";
import {
  CARGO_PROVIDER,
  type CargoProvider,
} from "../surat-cargo/helpers/cargo-provider";
import { CarrierCancellationService } from "../surat-cargo/sync/carrier-cancellation.service";
import { SuratTrackingService } from "../surat-cargo/sync/surat-tracking.service";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import { NotificationType } from "../notification/dto/notification.dto";
import { i18nMessage } from "../i18n";
import { platformWarehouseAddress } from "../../config/warehouse";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";

/**
 * İadenin FİZİKSEL bacağı — RefundService'ten birebir taşındı. Ürünün alıcıdan
 * satıcıya (ya da depoya) geri yolculuğu: Sürat iade barkodunun kesilmesi,
 * takip güncellemelerinin işlenmesi, teslim alınan iadenin paraya bağlanması ve
 * yolda takılan iadelerin süresi dolunca kapatılması.
 *
 * Parayı kendisi hesaplamaz — tutarlar RefundFinancialService'ten gelir; burada
 * yalnız "koli nerede ve bu ne zaman iadeyi tamamlar" sorusu yaşar. Cron
 * yüzeyleri (findPendingDeliveryToOpenReturn, findReturnDeliveredPendingFinalize,
 * expireStale*) refund-scheduler'ın çağırdığı sıralı, yeniden çalıştırılabilir
 * adaylardır.
 */
@Injectable()
export class RefundShipmentService {
  private readonly logger = new Logger(RefundShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    @Inject(CARGO_PROVIDER) private readonly cargo: CargoProvider,
    private readonly carrierCancellations: CarrierCancellationService,
    private readonly suratTrackingService: SuratTrackingService,
    private readonly notifications: RefundNotificationService,
    private readonly financials: RefundFinancialService,
  ) {}

  async openReturnShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            // Default adres yoksa default-olmayan adresi de kullan (default önce).
            buyer: {
              include: {
                addresses: { orderBy: { isDefault: "desc" }, take: 1 },
              },
            },
            seller: {
              include: {
                addresses: { orderBy: { isDefault: "desc" }, take: 1 },
              },
            },
            package: { select: { billableDesi: true } },
            product: { select: { shippingDesi: true } },
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.returnTrackingNumber) {
      this.logger.log(`Return shipment already exists for ${rr.refundNumber}`);
      return rr;
    }
    if (
      rr.status !== RefundRequestStatus.wait_for_delivery &&
      rr.status !== RefundRequestStatus.approved
    ) {
      throw new BadRequestException(
        i18nMessage("server.refund.shipmentApprovedOnly"),
      );
    }

    // Alıcı (iade alım noktası): önce siparişin TESLİMAT adresi (ürün oraya gitti →
    // iade oradan alınır), yoksa alıcının kayıtlı adresi.
    const buyerAddr =
      this.fallbackAddressFromOrderJson(rr.order.shippingAddress) ??
      rr.order.buyer.addresses[0];
    // Satıcı (iade teslim noktası): satıcının kayıtlı adresi; YOKSA Tarodan deposu
    // (çoğu satıcı/platform mağazası kayıtlı adres tutmaz → iade bloke olmasın/askıda
    // kalmasın). Depo adresi env'den (varsayılanlarla) gelir, takas akışıyla aynı kaynak.
    const sellerAddr =
      rr.order.seller.addresses[0] ?? this.warehouseReturnAddress();

    // Yalnız alıcı adresi gerçekten bulunamazsa iade kargosu açılamaz.
    if (!buyerAddr) {
      throw new BadRequestException(
        i18nMessage("server.refund.buyerAddressNotFound"),
      );
    }

    if (!this.cargo.isEnabled()) {
      this.logger.warn(
        `Surat integration disabled, marking ${rr.refundNumber} as return_shipment_open without provider call`,
      );
      const updated = await this.prisma.refundRequest.update({
        where: { id: rr.id },
        data: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: "manual",
          returnTrackingNumber: rr.refundNumber,
          returnCreatedAt: new Date(),
        },
      });
      await this.notifications.appendHistory(rr.id, {
        action: "return_opened",
        by: "system",
        details: { provider: "manual", trackingNumber: rr.refundNumber },
      });
      await this.notifications.safeNotify(
        rr.requesterId,
        NotificationType.REFUND_RETURN_OPENED,
        {
          refundNumber: rr.refundNumber,
          orderId: rr.orderId,
          trackingNumber: rr.refundNumber,
        },
      );
      await this.notifications.sendRefundEmail(
        rr.id,
        "buyer",
        "refund-return-label-buyer",
        {
          returnTrackingNumber: rr.refundNumber,
        },
      );
      return updated;
    }

    const result = await this.cargo.createShipment({
      idempotencyKey: `surat:refund-return:${rr.refundNumber}`,
      correlationId: `refund-${rr.id}`,
      reference: rr.refundNumber,
      recipient: {
        name: sellerAddr.fullName || rr.order.seller.displayName,
        address: sellerAddr.address,
        city: sellerAddr.city,
        district: sellerAddr.district,
        phone: sellerAddr.phone,
      },
      content: `İade: ${rr.order.orderNumber}`,
      isReturn: true,
      desi: rr.returnBillableDesi,
    });

    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === "business" ? r.message : `technical: ${r.code}`;
      throw new BadRequestException(
        i18nMessage("server.refund.suratShipmentFailed", { reason: errMsg }),
      );
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: "surat",
        returnTrackingNumber: rr.refundNumber,
        // Gerçek Sürat kodu şube kabulünden önce null kalabilir; kullanıcı
        // paketi returnTrackingNumber (OzelKargoTakipNo) ile şubeye teslim eder.
        returnProviderTrackingId: result.trackingCode,
        returnLabelZpl: result.labelData,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: new Date(),
      },
    });
    await this.notifications.appendHistory(rr.id, {
      action: "return_opened",
      by: "system",
      details: { provider: "surat", trackingNumber: rr.refundNumber },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_RETURN_OPENED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
        trackingNumber: rr.refundNumber,
      },
    );
    await this.notifications.sendRefundEmail(
      rr.id,
      "buyer",
      "refund-return-label-buyer",
      {
        returnTrackingNumber: rr.refundNumber,
        cargoCompany: "Sürat Kargo",
      },
    );
    return updated;
  }

  async finalizeRefundForReturnedShipment(refundRequestId: string) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: { order: true, financialComponents: true },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (rr.status === RefundRequestStatus.refunded) return rr;
    if (rr.financialReviewRequired && !rr.policyFinalizedAt) {
      throw new BadRequestException(
        i18nMessage("server.refund.financialReviewPending"),
      );
    }

    // MONEY-M1: Atomik CLAIM. Bu metod 3 yoldan EŞZAMANLI çağrılabilir
    // (finalizeReturnedShipments cron + Sürat sync + admin forceFinalize). Eski
    // `status===refunded` guard'ı TOCTOU'ya açıktı: ikisi de `return_delivered` okuyup
    // processRefund + finalize yan-etkilerini (order-update, history, ÇİFT bildirim/mail)
    // tekrarlardı. Yalnız BİR çağıran `return_delivered→refunded` geçişini kazanır;
    // count===0 → başka biri aldı → tekrarlama. (processRefund'ın kendi refundInProgress
    // marker'ı PayTR çift-çağrısını zaten engelliyor; bu CAS finalize yan-etkilerini tekilleştirir.)
    // Claim'in HANGİ durumdan alındığını bil: PSP hatasında geri alım aynı
    // duruma dönmeli. disputed'ı return_delivered'a ezmek hem itiraz kaydını
    // siliyor hem returnDeliveredAt=null satırı finalize cron'unun göremediği
    // sahte bir "teslim edildi" durumunda bırakıyordu.
    const claimedFromStatus =
      rr.status === RefundRequestStatus.disputed
        ? RefundRequestStatus.disputed
        : RefundRequestStatus.return_delivered;
    const claimed = await this.prisma.refundRequest.updateMany({
      where: {
        id: refundRequestId,
        // rr yukarıda okundu; CAS yalnız o durumdan claim eder — araya giren
        // bir durum değişikliği count=0 üretir ve tekrarlanmaz.
        status: claimedFromStatus,
      },
      data: { status: RefundRequestStatus.refunded, refundedAt: new Date() },
    });
    if (claimed.count === 0) {
      return (
        (await this.prisma.refundRequest.findUnique({
          where: { id: refundRequestId },
        })) ?? rr
      );
    }

    // `processRefund` resolves to null when the attempt was already finalized —
    // an idempotent no-op, not a failure — so the variable has to be able to
    // hold that, and readers fall back the same way a missing provider id does.
    let refundResult: { providerRefundId?: string } | null;
    try {
      refundResult = await this.paymentService.processRefund(
        rr.orderId,
        Number(rr.amount),
        {
          skipRefundEvent: true,
          refundQuantity: rr.refundQuantity,
          idempotencyKey: `refund-request:${rr.id}`,
          settlement: {
            closeOrder: rr.refundQuantity >= (rr.order.quantity ?? 1),
            holdPortion: Math.min(
              rr.refundQuantity / Math.max(rr.order.quantity ?? 1, 1),
              1,
            ),
            ...this.financials.feeSettlementFromComponents(
              rr.financialComponents,
              {
                sellerFeeAmount: Number(rr.refundedSellerFeeAmount),
                // Defter NET tutar ister (K6): brüt kolon yerine snapshot'taki net.
                buyerFeeAmount: this.financials.legacyBuyerFeeNetOf(rr),
              },
            ),
            ...this.financials.shippingSettlement(rr.id, {
              sellerShippingCompensationAmount: Number(
                rr.sellerShippingCompensationAmount,
              ),
              outboundShippingChargeToSeller: Number(
                rr.outboundShippingChargeToSeller,
              ),
              returnShippingChargeToSeller: Number(
                rr.returnShippingChargeToSeller,
              ),
            }),
          },
        }, // REFUND_COMPLETED'ı aşağıda kendimiz gönderiyoruz
      );
    } catch (err) {
      // processRefund BAŞARISIZ → claim'i GERİ AL: satır claim edildiği duruma
      // döner (return_delivered → cron retry eder; disputed → itiraz ekranda
      // kalır, admin yeniden dener). (Money iade edilmedi; yalnız claim
      // kilidini bıraktık.)
      await this.prisma.refundRequest
        .updateMany({
          where: {
            id: refundRequestId,
            status: RefundRequestStatus.refunded,
          },
          data: {
            status: claimedFromStatus,
            refundedAt: null,
          },
        })
        .catch(() => undefined);
      throw err;
    }

    // Money iade EDİLDİ — buradan sonrası best-effort (claim geri ALINMAZ).
    const updated = await this.prisma.refundRequest.update({
      where: { id: rr.id },
      data: {
        providerRefundId: refundResult?.providerRefundId ?? null,
        returnDeliveredAt: rr.returnDeliveredAt ?? new Date(),
      },
    });

    // Hold (adet bazlı) tüketimi processRefund içinde tek otoriteden yapıldı.
    // Kargo sonrası gerçek İADE → raporlama ayrımı.
    await this.prisma.order
      .update({
        where: { id: rr.orderId },
        data: { cancellationType: "iade" },
      })
      .catch(() => undefined);
    await this.notifications.appendHistory(rr.id, {
      action: "refund_completed",
      by: "system",
      details: { providerRefundId: refundResult?.providerRefundId ?? null },
    });
    await this.notifications.safeNotify(
      rr.requesterId,
      NotificationType.REFUND_COMPLETED,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );
    // "Para iadeniz tamamlandı" maili eksikti (sadece zile düşüyordu) — eklendi.
    await this.notifications.sendRefundEmail(
      rr.id,
      "buyer",
      "refund-completed",
    );
    // Satıcı tarafı: iade tamamlandı bildirimi + mail.
    await this.notifications.safeNotify(
      rr.order.sellerId,
      NotificationType.REFUND_COMPLETED_SELLER,
      {
        refundNumber: rr.refundNumber,
        orderId: rr.orderId,
      },
    );
    await this.notifications.sendRefundEmail(
      rr.id,
      "seller",
      "refund-completed-seller",
    );
    return updated;
  }

  async findPendingDeliveryToOpenReturn(): Promise<string[]> {
    const candidates = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.wait_for_delivery,
        order: {
          status: {
            in: [
              OrderStatus.delivered,
              OrderStatus.awaiting_buyer_confirmation,
              OrderStatus.completed,
            ],
          },
        },
      },
      select: { id: true },
    });
    return candidates.map((c) => c.id);
  }

  /**
   * D25 (insani senaryo): alıcı iadeyi açtı ama paketi hiç şubeye götürmedi —
   * satıcının hold'u süresiz donuk kalıyordu. `return_shipment_open` + N gün
   * (env REFUND_RETURN_DROPOFF_DAYS, vars. 7) hareketsiz kalan Sürat iadelerini
   * yerelde iptal eder: hold çözülür ve alıcıya bildirim gider. Resmi REST
   * sözleşmesinde uzak iptal olmadığı için fiziksel kayıt/kod operasyon ekibinin
   * Sürat paneli müdahalesini gerektirir.
   *
   * Güvenlik: iptal ETMEDEN önce Sürat'tan CANLI takip çekilir — pakette
   * hareket varsa (alıcı son anda götürdü, poll henüz görmedi) iptal atlanır ve
   * normal poll akışına bırakılır. Sorgu başarısızsa da (belirsizlik) iptal
   * edilmez, sonraki tick tekrar dener. Yalnız `surat` iadeler: manuel iade
   * poll'lanamadığından yanlış iptal riski var → ops takibi.
   */
  async expireStaleOpenReturns(): Promise<number> {
    const days = envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_DROPOFF_DAYS);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let stale: Array<{
      id: string;
      refundNumber: string;
      requesterId: string;
      order: { id: string; sellerId: string };
    }>;
    try {
      stale = await this.prisma.refundRequest.findMany({
        where: {
          status: RefundRequestStatus.return_shipment_open,
          returnProvider: "surat",
          returnCreatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          refundNumber: true,
          requesterId: true,
          order: { select: { id: true, sellerId: true } },
        },
        take: 25,
      });
    } catch (e: any) {
      this.logger.error(`expireStaleOpenReturns query failed: ${e?.message}`);
      return 0;
    }

    let expired = 0;
    for (const rr of stale) {
      try {
        // Canlı doğrulama: pakette hareket varsa iptal etme.
        const live = await this.suratTrackingService.fetchTrackingInfo(
          rr.refundNumber,
        );
        if (!live) continue; // belirsizlik → bu tick atla
        const gonderi = live.Gonderiler?.[0];
        const hasMovement =
          !!gonderi &&
          ((gonderi.Hareketler?.length ?? 0) > 0 ||
            (gonderi.KargonunDurumuSayi ?? 1) >= 2);
        if (hasMovement) {
          this.logger.log(
            `Skip expiry for ${rr.refundNumber}: live Surat data shows movement; poll will pick it up`,
          );
          continue;
        }

        const cancellationTask = await this.carrierCancellations.request({
          provider: "surat",
          reference: rr.refundNumber,
          entityType: "refund_return",
          entityId: rr.id,
          reason: "return_dropoff_expired",
          metadata: {
            orderId: rr.order.id,
            refundNumber: rr.refundNumber,
            dropoffDays: days,
          },
          updateLocal: async (tx) => {
            await tx.refundRequest.update({
              where: { id: rr.id },
              data: {
                status: RefundRequestStatus.cancelled,
                decidedAt: new Date(),
                decidedBy: "system",
              },
            });
          },
        });
        // Hold kilidini kaldır → normal escrow akışına dönsün.
        await this.financials.unfreezeHoldForRefund(rr.order.id);
        await this.notifications.appendHistory(rr.id, {
          action: "return_dropoff_expired",
          by: "system",
          details: { days, carrierCancellationRequired: true },
        });
        this.logger.warn(
          `Refund ${rr.refundNumber} locally expired; carrier cancellation task=${cancellationTask.id}`,
        );
        await this.notifications.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
            // Sistem süre aşımıyla kapattı → talebin sahibi olan ALICIYA gider.
            audience: "buyer",
          },
        );
        expired++;
        this.logger.log(
          `Refund ${rr.refundNumber} expired: return not dropped off within ${days}d`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to expire stale refund ${rr.id}: ${e?.message}`,
        );
      }
    }
    return expired;
  }

  /**
   * MONEY-H6: `wait_for_delivery`'de N günden (REFUND_WAIT_DELIVERY_MAX_DAYS, vars. 30)
   * uzun TAKILI iadeler — orijinal sipariş hiç teslim edilmediğinden return HİÇ açılmadı,
   * hold süresiz donuk kaldı. İptal et + hold kilidini kaldır (satıcı normal escrow akışına
   * döner; sipariş sonradan teslim olursa alıcı yeni talep açabilir). return_shipment_open
   * ayrı bir sweep'le (D25) ele alınır; bu yalnız wait_for_delivery'yi hedefler.
   */
  async expireStaleWaitForDelivery(): Promise<number> {
    const days = Number(process.env.REFUND_WAIT_DELIVERY_MAX_DAYS) || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let stale: Array<{
      id: string;
      refundNumber: string;
      requesterId: string;
      order: { id: string; sellerId: string };
    }>;
    try {
      stale = await this.prisma.refundRequest.findMany({
        where: {
          status: RefundRequestStatus.wait_for_delivery,
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          refundNumber: true,
          requesterId: true,
          order: { select: { id: true, sellerId: true } },
        },
        take: 25,
      });
    } catch (e: any) {
      this.logger.error(
        `expireStaleWaitForDelivery query failed: ${e?.message}`,
      );
      return 0;
    }

    let expired = 0;
    for (const rr of stale) {
      try {
        await this.prisma.refundRequest.update({
          where: { id: rr.id },
          data: {
            status: RefundRequestStatus.cancelled,
            decidedAt: new Date(),
            decidedBy: "system",
          },
        });
        await this.financials.unfreezeHoldForRefund(rr.order.id);
        await this.notifications.appendHistory(rr.id, {
          action: "wait_for_delivery_expired",
          by: "system",
          details: { days },
        });
        await this.notifications.safeNotify(
          rr.requesterId,
          NotificationType.REFUND_CANCELLED,
          {
            refundNumber: rr.refundNumber,
            orderId: rr.order.id,
            // Sistem süre aşımıyla kapattı → talebin sahibi olan ALICIYA gider.
            audience: "buyer",
          },
        );
        expired++;
        this.logger.log(
          `Refund ${rr.refundNumber} expired: order not delivered within ${days}d (wait_for_delivery)`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to expire stale wait_for_delivery refund ${rr.id}: ${e?.message}`,
        );
      }
    }
    return expired;
  }

  // D26 (insani senaryo): iade satıcıya teslim edildikten sonra parayı ANINDA
  // iade etme — satıcıya kutuyu açıp kontrol etmesi için bir pencere tanı
  // (REFUND_RETURN_INSPECTION_HOURS, vars. 24 saat). Sorun varsa admin kaydı
  // `disputed` yapar; bu sorgu yalnız `return_delivered` seçtiğinden disputed
  // kayıt finalize edilmez. Pencere dolunca cron otomatik finalize eder.
  // (Poller'daki anlık finalize kaldırıldı — tek finalize yolu bu cron.)
  async findReturnDeliveredPendingFinalize(): Promise<string[]> {
    const hours = envConfigNumber(PAYMENT_CONFIG_KEYS.RETURN_INSPECTION_HOURS);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const rows = await this.prisma.refundRequest.findMany({
      where: {
        status: RefundRequestStatus.return_delivered,
        returnDeliveredAt: { lt: cutoff },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async applyReturnTrackingUpdate(
    refundRequestId: string,
    update: { status: ShipmentStatus; deliveredAt?: Date; shippedAt?: Date },
  ) {
    // L4: diğer iki poll path'indeki (shipment/trade) terminal-regresyon
    // guard'ının paritesi — bayat/eski bir Sürat cevabı returnStatus'u geriye
    // sarmasın (ör. returned → in_transit).
    const current = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      select: { returnStatus: true, returnShippedAt: true },
    });
    if (
      current?.returnStatus &&
      !canTransitionShipmentStatus(
        current.returnStatus as ShipmentStatus,
        update.status,
      )
    ) {
      this.logger.warn(
        `Skipping illegal return-status transition ${current.returnStatus} → ${update.status} for refund ${refundRequestId}`,
      );
      return null;
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        returnStatus: update.status,
        returnShippedAt: update.shippedAt ?? undefined,
        returnDeliveredAt: update.deliveredAt ?? undefined,
        // Sürat kod 12 (İade Teslim Edildi) mapper'da ShipmentStatus.returned'a
        // maplenir; iade akışında bu "paket satıcıya geri teslim edildi" demektir
        // → return_delivered (otomatik iade finalize'i buna bağlı).
        // Doküman kod 9/10/11/13/14/15/16 (İade sürecinde/yolda/şubede/dağıtımda)
        // → return_in_progress'e maplenir; iade satıcıya geri yolda demektir
        // → return_in_transit.
        status:
          update.status === ShipmentStatus.delivered ||
          update.status === ShipmentStatus.returned
            ? RefundRequestStatus.return_delivered
            : update.status === ShipmentStatus.in_transit ||
                update.status === ShipmentStatus.picked_up ||
                update.status === ShipmentStatus.return_in_progress
              ? RefundRequestStatus.return_in_transit
              : undefined,
      },
      include: { order: { select: { sellerId: true } } },
    });

    // Kargo takip adımları önceden tamamen sessizdi. Her iki taraf da bilgilendirilsin.
    // Bell + push (her ping'de mail spam'i olmasın diye mail göndermiyoruz).
    const notifData = {
      refundNumber: updated.refundNumber,
      orderId: updated.orderId,
    };
    const statusChanged = current?.returnStatus !== update.status;
    if (
      statusChanged &&
      (update.status === ShipmentStatus.in_transit ||
        update.status === ShipmentStatus.picked_up ||
        update.status === ShipmentStatus.return_in_progress)
    ) {
      await this.notifications.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_IN_TRANSIT,
        notifData,
      );
      await this.notifications.safeNotify(
        updated.order.sellerId,
        NotificationType.REFUND_RETURN_SHIPPED_SELLER,
        notifData,
      );
      // Satıcıya bir kez markalı mail: ürün kendisine geliyor.
      await this.notifications.sendRefundEmail(
        updated.id,
        "seller",
        "refund-return-incoming-seller",
        {
          returnTrackingNumber:
            updated.returnTrackingNumber ?? updated.refundNumber,
        },
      );
    } else if (
      statusChanged &&
      (update.status === ShipmentStatus.delivered ||
        update.status === ShipmentStatus.returned)
    ) {
      await this.notifications.safeNotify(
        updated.requesterId,
        NotificationType.REFUND_RETURN_DELIVERED_BUYER,
        notifData,
      );
      await this.notifications.safeNotify(
        updated.order.sellerId,
        NotificationType.REFUND_RETURN_DELIVERED_SELLER,
        notifData,
      );
    }

    return updated;
  }

  private fallbackAddressFromOrderJson(json: Prisma.JsonValue | null) {
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const j = json as Record<string, any>;
    if (!j.fullName || !j.address || !j.city || !j.district || !j.phone)
      return null;
    return {
      fullName: String(j.fullName),
      address: String(j.address),
      city: String(j.city),
      district: String(j.district),
      phone: String(j.phone),
    };
  }

  /**
   * Satıcının kayıtlı adresi olmadığında iade kargosunun gideceği Tarodan deposu
   * adresi — takas akışıyla TEK kaynaktan (config/warehouse) gelir; env yoksa
   * mantıklı varsayılanlara düşer (asla null dönmez) → adressiz satıcı iadeyi bloke etmez.
   */
  private warehouseReturnAddress() {
    return platformWarehouseAddress();
  }

  // NOT (M4): iade barkodu için ayrı bir retry yüzeyi YOK — bilinçli.
  // openReturnShipment BLOCKING'tir: Sürat başarısızsa throw eder ve hiçbir şey
  // yazmaz (returnProvider="surat" + kodsuz durum oluşamaz). Kurtarma yolu
  // refund-scheduler'dır: kayıt wait_for_delivery'de kalır ve
  // openReturnShipmentsForDeliveredOrders (10 dk) tam açılışı yeniden dener.
}
