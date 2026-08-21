import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PrismaService } from "../../../prisma";
import {
  ShipmentStatus,
  OrderStatus,
  RefundRequestStatus,
  Prisma,
} from "@prisma/client";
import type {
  SuratTakipGonderi,
  SuratTrackingLookupResult,
} from "../helpers/surat-cargo.types";
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
  isSuratReturnFlow,
  isSuratReturnCompleted,
} from "../mappers/surat-status.mapper";
import { canTransitionShipmentStatus } from "../../shipping/helpers/shipment-state-machine";
import { SHIPPABLE_ORDER_STATUSES } from "../../order/helpers/order-state-machine";
import { SuratTrackingClient } from "../clients/surat-tracking.client";

/**
 * OrderTrackingSyncService (Faz 11.3a): order Shipment satırlarının Sürat takip
 * senkronizasyonu — durum çekme, ShipmentEvent üretimi ve teslim/iade akış işleme
 * (11.2c atomik CAS + escrow tx dahil).
 */
@Injectable()
export class OrderTrackingSyncService {
  private readonly logger = new Logger(OrderTrackingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly client: SuratTrackingClient,
  ) {}

  /**
   * Sync a shipment's status from Sürat Kargo tracking API.
   * Updates Shipment record, creates ShipmentEvents, and handles delivery/return logic.
   */
  async syncShipmentTracking(shipmentId: string): Promise<boolean> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment || shipment.provider !== "surat") {
      return false;
    }

    // Sürat sorgusu OzelKargoTakipNo ile yapılır = shipment.trackingNumber
    // (oto-oluşturmada order.orderNumber olarak yazılır). providerTrackingId Sürat'ın
    // KargoTakipNo'sudur (WebSiparisKodu DEĞİL), orderId ise iç UUID — ikisi de yanlış
    // referans olup "Gonderiler boş" döndürür. (#84)
    // trackingNumber yoksa hiç Sürat'a düşmemiş manuel kayıt — eski orderId
    // fallback'i her zaman boş sonuç veriyordu; hiç sorma. (N3)
    if (!shipment.trackingNumber) {
      return false;
    }
    const lookup = await this.fetchParcel(shipment.trackingNumber);
    if (lookup.kind !== "found") return false;
    return this.applyTrackingUpdate(shipment, lookup.gonderi);
  }

  /**
   * Sync all active Sürat shipments (not yet delivered/returned/cancelled).
   * Intended to be called by a cron job or Bull queue.
   *
   * Sorgu birimi KOLİDİR, sipariş satırı değil: bir OrderPackage = bir fiziksel
   * gönderi = bir OzelKargoTakipNo (PKG-…). 3 ürünlü tek satıcı paketi eskiden
   * Sürat'ı aynı gönderi için 3 kez sorguluyordu; artık tek sorgu yapılıp sonuç
   * paketin tüm satırlarına uygulanır. Statü geçişi (CAS) ve teslim escrow'u
   * satır bazında kalır — iade/ödeme muhasebesi sipariş bazlı olduğu için.
   */
  async syncAllActiveShipments(): Promise<{
    synced: number;
    pending: number;
    failed: number;
  }> {
    // Only sync shipments that have a tracking reference. Auto-created
    // pending shipments without a Sürat tracking number would just spam
    // the API with "not found" responses.
    return this.syncShipmentsWhere({
      status: {
        notIn: [
          ShipmentStatus.delivered,
          ShipmentStatus.returned,
          ShipmentStatus.cancelled,
        ],
      },
    });
  }

  /**
   * Teslim EDİLMİŞ kolileri, iade penceresi boyunca sormaya devam eder.
   *
   * Neden ayrı bir yüzey: `syncAllActiveShipments` teslim edilmişi sorgudan
   * düşürüyor, çünkü teslim normalde son duraktır. Ama taşıyıcı tarafında elle
   * başlatılan iade teslimden SONRA gelir ve AYNI etiket üzerinde yürür — koli
   * `delivered` olduğu an peşini bıraktığımız için o hareketleri hiç görmüyorduk.
   * Prod'da bire bir bu yaşandı: 10:51'de teslim, 11:00'de son poll, 12:09'da
   * iade satıcıya ulaştı ve sistemde hiçbir izi olmadı.
   *
   * Pencere kademeli, çünkü maliyet sıklıktan değil pencerenin uzunluğundan
   * geliyor: 14 gün boyunca her teslim edilmiş koliyi sık sormak taşıyıcıya
   * giden yükü katlar. İade orijinal etiketle dönüyorsa teslimin hemen ardından
   * başlar (bu vakada 74 dakika), o yüzden ilk aralık sık, kuyruk seyrek.
   *
   * @param fromHoursAgo pencerenin YAŞLI ucu (bu kadar saat öncesine kadar)
   * @param toHoursAgo pencerenin TAZE ucu; 0 = şimdi
   */
  async syncPostDeliveryShipments(
    fromHoursAgo: number,
    toHoursAgo = 0,
  ): Promise<{ synced: number; pending: number; failed: number }> {
    const now = Date.now();
    return this.syncShipmentsWhere({
      status: ShipmentStatus.delivered,
      deliveredAt: {
        gte: new Date(now - fromHoursAgo * 3_600_000),
        lt: new Date(now - toHoursAgo * 3_600_000),
      },
    });
  }

  /**
   * Koli bazında sorgulama çekirdeği. Aktif ve teslim-sonrası yüzeyler yalnız
   * WHERE'de ayrışır; gruplama, tek-sorgu ve uygulama mantığı ortak kalmalı ki
   * biri düzelirken diğeri geride kalmasın.
   */
  private async syncShipmentsWhere(
    where: Prisma.ShipmentWhereInput,
  ): Promise<{ synced: number; pending: number; failed: number }> {
    const activeShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        ...where,
        OR: [
          { providerTrackingId: { not: null } },
          { trackingNumber: { not: null } },
        ],
      },
      include: { order: true },
    });

    // Koli bazında grupla: anahtar = Sürat sorgu referansı (trackingNumber).
    // Referansı olmayan satır zaten sorgulanamaz — kendi başına bir grup olur ve
    // syncShipmentTracking'in erken çıkışına düşer (davranış aynı).
    const parcels = new Map<string, typeof activeShipments>();
    for (const shipment of activeShipments) {
      const key = shipment.trackingNumber ?? `shipment:${shipment.id}`;
      const siblings = parcels.get(key);
      if (siblings) siblings.push(shipment);
      else parcels.set(key, [shipment]);
    }

    let synced = 0;
    let pending = 0;
    let failed = 0;

    for (const [ref, siblings] of parcels) {
      try {
        // Tek Sürat çağrısı; sonuç kolinin tüm satırlarına uygulanır.
        const lookup = siblings[0].trackingNumber
          ? await this.fetchParcel(siblings[0].trackingNumber)
          : ({ kind: "failure" } as const);
        if (lookup.kind === "pending") {
          pending += siblings.length;
          continue;
        }
        if (lookup.kind === "cancelled") {
          // Taşıyıcıda iptal: hata değil, sonuç. Yerelde de terminale çekilmezse
          // koli sorguda kalır ve her tur "başarısız" sayılıp alarm üretir.
          synced += await this.markParcelCancelled(siblings, lookup.message);
          continue;
        }
        if (lookup.kind !== "found") {
          failed += siblings.length;
          continue;
        }
        for (const shipment of siblings) {
          const success = await this.applyTrackingUpdate(
            shipment,
            lookup.gonderi,
          );
          if (success) synced++;
          else failed++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to sync parcel ${ref}: ${error.message}`);
        failed += siblings.length;
      }
    }

    this.logger.log(
      `Surat tracking sync: ${synced} synced, ${pending} pending, ${failed} failed out of ` +
        `${activeShipments.length} shipments in ${parcels.size} parcels`,
    );
    return { synced, pending, failed };
  }

  /**
   * Taşıyıcıda iptal edilmiş bir kolinin satırlarını yerelde de kapatır.
   *
   * Durum makinesine UYAR: `delivered`/`returned` gibi terminal bir satır
   * `cancelled`'a geri çekilemez (teslim edilmiş koliyi iptale düşürmek escrow
   * kararını geri sarardı), o satırlar olduğu gibi bırakılır — zaten poller
   * sorgusunda değiller.
   */
  private async markParcelCancelled(
    siblings: { id: string; status: ShipmentStatus }[],
    providerMessage: string,
  ): Promise<number> {
    let closed = 0;
    for (const shipment of siblings) {
      if (
        !canTransitionShipmentStatus(shipment.status, ShipmentStatus.cancelled)
      ) {
        this.logger.warn(
          `Surat reports ${shipment.id} cancelled but local status ${shipment.status} is terminal; leaving as is`,
        );
        continue;
      }
      const cas = await this.prisma.shipment.updateMany({
        where: { id: shipment.id, status: shipment.status },
        data: {
          status: ShipmentStatus.cancelled,
          providerRawStatus: providerMessage,
        },
      });
      closed += cas.count;
    }
    return closed;
  }

  /** Bir koliyi Sürat'tan tek sorguyla çeker (OzelKargoTakipNo = PKG-…). */
  private async fetchParcel(
    ref: string,
  ): Promise<
    | { kind: "found"; gonderi: SuratTakipGonderi }
    | Exclude<SuratTrackingLookupResult, { kind: "found" }>
  > {
    const lookup = await this.client.lookupTracking(ref);
    if (lookup.kind !== "found") return lookup;
    const gonderi = lookup.data.Gonderiler[0];
    return gonderi
      ? { kind: "found", gonderi }
      : { kind: "pending", message: "Takip kaydı henüz görünmüyor" };
  }

  private async applyTrackingUpdate(
    shipment: any,
    gonderi: SuratTakipGonderi,
  ): Promise<boolean> {
    const mappedStatus = mapSuratStatusToShipmentStatus(
      gonderi.KargonunDurumuSayi,
    );
    // L2: bilinmeyen kod statüyü değiştirmez; ham kod yine kaydedilir.
    if (mappedStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${gonderi.KargonunDurumuSayi} ("${gonderi.KargonunDurumu}") for shipment ${shipment.id}; keeping status ${shipment.status}`,
      );
    }
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);
    const isReturnCompleted = isSuratReturnCompleted(gonderi);
    // Tamamlanmış iade `returned`'dır — kod tablosu ne derse desin. Canlıda
    // tamamlanma kodu 13 ile geliyor ve tablo 13'ü `return_in_progress`'e
    // eşliyor; haritaya bırakılırsa koli iade parası çoktan ödenmişken
    // "iade sürecinde" takılı kalır, terminal olmadığı için de sonsuza kadar
    // sorgulanır. Tek karar mercii `isSuratReturnCompleted`.
    const newStatus = isReturnCompleted
      ? ShipmentStatus.returned
      : (mappedStatus ?? shipment.status);
    // KargoTakipHareketDetayi'nda gönderi satırının görünmesi, ön bildirimin
    // şubede kabul edilip gerçek Sürat koduna dönüştüğü ilk güvenilir işarettir.
    const firstPhysicalHandoff =
      !shipment.shippedAt &&
      Boolean(gonderi.KargoTakipNo) &&
      !isSuratReturnFlow(gonderi.KargonunDurumuSayi);

    // #86: a re-poll can return a stale/older code; never regress a terminal
    // shipment (e.g. delivered → in_transit). Skip the update, keep current state.
    if (!canTransitionShipmentStatus(shipment.status, newStatus)) {
      this.logger.warn(
        `Skipping illegal shipment transition ${shipment.status} → ${newStatus} ` +
          `for ${shipment.id} (Sürat poll, code=${gonderi.KargonunDurumuSayi})`,
      );
      return false;
    }

    // Build update data
    const updateData: Record<string, any> = {
      status: newStatus,
      providerStatusCode: gonderi.KargonunDurumuSayi,
      providerRawStatus: gonderi.KargonunDurumu,
    };
    if (firstPhysicalHandoff) updateData.shippedAt = new Date();

    // Set tracking number and URL from Sürat if we don't have them yet
    if (!shipment.trackingNumber && gonderi.KargoTakipNo) {
      updateData.trackingNumber = gonderi.KargoTakipNo;
    }
    if (!shipment.trackingUrl && gonderi.TakipUrl) {
      updateData.trackingUrl = gonderi.TakipUrl;
    }

    // Provider-specific tracking ID
    if (!shipment.providerTrackingId && gonderi.KargoTakipNo) {
      updateData.providerTrackingId = gonderi.KargoTakipNo;
    }

    // Faz 2 taşıyıcı mutabakatı: Sürat'ın GERÇEK faturaladığı tutar/desi. Her poll'de
    // gelir ama önceden düşürülüyordu → müşteriden alınan kargo ile karşılaştırılamıyordu.
    const carrierGross = Number(gonderi.Tutar ?? 0);
    if (Number.isFinite(carrierGross) && carrierGross > 0) {
      updateData.carrierActualCost = carrierGross;
      const net = Number(gonderi.TutarKdvsiz ?? 0);
      const tax = Number(gonderi.KdvTutar ?? 0);
      const desi = Number(gonderi.ToplamDesiKg ?? 0);
      if (Number.isFinite(net) && net > 0) updateData.carrierNetCost = net;
      if (Number.isFinite(tax) && tax > 0) updateData.carrierTaxAmount = tax;
      if (Number.isFinite(desi) && desi > 0) updateData.carrierDesi = desi;
      updateData.carrierCostSyncedAt = new Date();
    }

    // Delivery info. H1: tarih parse edilemezse teslim gerçeği kaybolmasın —
    // yaklaşık zaman olarak şimdi'yi yaz (Invalid Date update'i patlatıyordu).
    if (isDelivered && gonderi.TeslimTarihi) {
      updateData.deliveredAt =
        this.client.parseSuratDate(gonderi.TeslimTarihi) ?? new Date();
    }
    if (gonderi.TeslimAlan) {
      updateData.receivedBy = gonderi.TeslimAlan;
    }

    // Estimated delivery — parse edilemiyorsa hiç yazma (kritik olmayan alan).
    if (gonderi.PlanlananTeslimTarihi && !shipment.estimatedDelivery) {
      const estimated = this.client.parseSuratDate(
        gonderi.PlanlananTeslimTarihi,
      );
      if (estimated) {
        updateData.estimatedDelivery = estimated;
      }
    }

    // Return info
    if (isSuratReturnFlow(gonderi.KargonunDurumuSayi)) {
      const reason = gonderi.IadeAciklama || gonderi.DevirSebebi || "";
      if (reason) {
        updateData.returnReason = reason;
      }
    }

    // Update shipment — M7 CAS: canTransition guard'ı baştaki snapshot'a göre
    // çalışıyor; arada başka bir yazar (webhook, admin) statüyü değiştirdiyse bu
    // güncelleme stale'dir. Snapshot'ı where'e koy: count 0 → hiçbir alanı yazma,
    // sonraki tick taze snapshot'la işler. (delivered→in_transit regresyonu gibi
    // terminal-dışı yarış pencerelerini kapatır.)
    // 11.2c: CAS flip + teslim escrow'u ATOMİK. Eskiden CAS anında commit olup
    // handleOrderDelivered AYRI çağrıda koşuyordu; arada çökme shipment'ı `delivered`
    // (terminal → re-poll'da atlanır) bırakıp PaymentHold.releaseAt=null'ı ASKIDA
    // bırakabiliyordu (satıcı hiç ödenmez, kendi kendine düzelmez). Webhook yoluyla aynı
    // desen: CAS + escrow tek tx'te (ya ikisi ya hiçbiri; hata → rollback → sonraki poll
    // retry eder). handleOrderDelivered tx-güvenli (webhook de tx geçiyor) + idempotent.
    // Bildirim + event sync POST-COMMIT (dış I/O / kritik olmayan tx'e girmez).
    let orderMarkedShipped = false;
    let deliveryResult: {
      acted: boolean;
      use48h: boolean;
      confirmationDeadline: Date | null;
      buyerId: string | null;
    } | null = null;
    const flipped = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.shipment.updateMany({
        where: {
          id: shipment.id,
          status: shipment.status,
          ...(firstPhysicalHandoff ? { shippedAt: null } : {}),
        },
        data: updateData,
      });
      if (cas.count === 0) return false;
      if (firstPhysicalHandoff) {
        const orderCas = await tx.order.updateMany({
          where: {
            id: shipment.orderId,
            // Tek kaynak: order-state-machine (satıcı ve admin yolları da aynı
            // listeye uyar) — kapanmış sipariş `shipped`'e diriltilemez.
            status: { in: [...SHIPPABLE_ORDER_STATUSES] },
          },
          data: {
            status: OrderStatus.shipped,
            version: { increment: 1 },
          },
        });
        orderMarkedShipped = orderCas.count > 0;
      }
      if (isDelivered) {
        const deliveredAt =
          updateData.deliveredAt instanceof Date
            ? updateData.deliveredAt
            : new Date();
        // PaymentService circular import'u önlemek için lazy resolve. (#83)
        const { PaymentService } =
          await import("../../payment/payment.service");
        const paymentService = this.moduleRef.get(PaymentService, {
          strict: false,
        });
        if (paymentService) {
          deliveryResult = await paymentService.handleOrderDelivered(
            shipment.orderId,
            deliveredAt,
            tx,
          );
        }
      }
      return true;
    });
    if (!flipped) {
      this.logger.warn(
        `Skipping stale shipment update for ${shipment.id}: status changed concurrently (snapshot=${shipment.status})`,
      );
      return false;
    }

    // Sync movement events (Hareketler) — POST-COMMIT (bilgi amaçlı, kritik değil).
    await this.syncShipmentEvents(shipment.id, gonderi);

    // Sipariş statüsü CAS ile ilk kez shipped olduğunda tek seferlik alıcı bildirimi.
    if (orderMarkedShipped && shipment.order?.buyerId) {
      try {
        const { NotificationService } =
          await import("../../notification/notification.service");
        const notificationService = this.moduleRef.get(NotificationService, {
          strict: false,
        });
        // Koli başına TEK bildirim (kardeş sipariş satırları sessiz kalır).
        const { PaymentService: PaymentSvc } =
          await import("../../payment/payment.service");
        const paymentSvc = this.moduleRef.get(PaymentSvc, { strict: false });
        const claimed =
          (await paymentSvc?.claimOrderAnnouncement?.("shipped", {
            id: shipment.orderId,
            packageId: shipment.packageId,
          })) ?? true;
        if (claimed) {
          await notificationService?.notifyOrderShipped(
            shipment.order.buyerId,
            shipment.orderId,
            gonderi.KargoTakipNo,
          );
        }
      } catch (e: any) {
        this.logger.warn(
          `notify order-shipped failed (poll) for ${shipment.orderId}: ${e?.message}`,
        );
      }
    }

    // 48h teslim-onay bildirimi — POST-COMMIT best-effort (dış I/O tx'e girmez).
    const dr = deliveryResult as {
      acted: boolean;
      use48h: boolean;
      confirmationDeadline: Date | null;
      buyerId: string | null;
    } | null;
    // Teslim duyurusu (alıcıya bildirim + e-posta) — 48h bayrağından BAĞIMSIZ.
    // Teslim, iade hakkının ve satıcı ödeme saatinin başladığı andır; sessiz
    // geçerse kullanıcı süreçlerin başladığını hiç öğrenmez.
    if (isDelivered && dr?.acted) {
      try {
        const { PaymentService } =
          await import("../../payment/payment.service");
        const paymentService = this.moduleRef.get(PaymentService, {
          strict: false,
        });
        await paymentService?.announceOrderDelivered?.(shipment.orderId);
      } catch (e: any) {
        this.logger.warn(
          `announce delivered failed (poll) for ${shipment.orderId}: ${e?.message}`,
        );
      }
    }

    if (
      isDelivered &&
      dr?.acted &&
      dr.use48h &&
      dr.confirmationDeadline &&
      dr.buyerId
    ) {
      try {
        const { NotificationService } =
          await import("../../notification/notification.service");
        const notificationService = this.moduleRef.get(NotificationService, {
          strict: false,
        });
        await notificationService?.notifyOrderDeliveredConfirm(
          dr.buyerId,
          shipment.orderId,
          dr.confirmationDeadline,
        );
      } catch (e: any) {
        this.logger.warn(
          `notify delivered-confirm failed (poll) for ${shipment.orderId}: ${e?.message}`,
        );
      }
    }

    // Bu sipariş için ZATEN yürüyen bir iade talebi varsa otomatik iadeyi
    // ÇALIŞTIRMA. İkisi de aynı siparişin parasına dokunuyor: biri
    // `processRefund`'ı doğrudan çağırıyor, diğeri kendi muhasebe anlık
    // görüntüsüyle (financial_policy_snapshot) finalize ediyor. İkisi birden
    // koşarsa alıcıya iki kez iade çıkabilir. Karar hakkı iade hattının —
    // orada politika, tutar kırılımı ve muayene penceresi zaten hesaplanmış.
    //
    // Prod'da bu tam olarak mümkün oldu: koli taşıyıcıda iade döndü, operatör
    // aynı sipariş için panelden iade açtı; teslim sonrası izleme devreye
    // girdiğinde iki yol da tetiklenecekti.
    const openRefund =
      isReturnCompleted && shipment.order
        ? await this.prisma.refundRequest.findFirst({
            where: {
              orderId: shipment.orderId,
              status: {
                notIn: [
                  RefundRequestStatus.refunded,
                  RefundRequestStatus.rejected,
                  RefundRequestStatus.cancelled,
                ],
              },
            },
            select: { id: true, refundNumber: true, status: true },
          })
        : null;
    if (openRefund) {
      this.logger.log(
        `Carrier return completed for order ${shipment.orderId} but refund ${openRefund.refundNumber} ` +
          `is already in flight (${openRefund.status}); leaving the refund pipeline to settle it`,
      );
    }

    if (isReturnCompleted && shipment.order && !openRefund) {
      // SEAM-B3: Outbound paket göndericiye İADE döndü (Sürat kod 12). Bu, buyer'ın
      // açtığı RefundRequest pipeline'ından AYRI bir senaryodur (alıcı teslim almadı/
      // reddetti → paket geri geldi; RefundRequest yok). Order'ı ATOMİK olarak
      // refund_requested'a geçir — ama zaten cancelled/refunded ise DOKUNMA (başarılı
      // bir önceki iadeyi geri sarmayalım; re-poll idempotency). Sonra processRefund'ı
      // dene. Başarısız olursa order refund_requested + shipment=returned'da kalır;
      // poller terminal (returned) shipment'ı ARTIK POLLAMADIĞINDAN kendi kendine
      // retry edemez → processRefundedOrders sweep'inin returned-arm'ı bunu bulup
      // RETRY eder (askıda kalmaz). processRefund başarınca order=cancelled → bir daha
      // eşleşmez (idempotent).
      const claimed = await this.prisma.order.updateMany({
        where: {
          id: shipment.orderId,
          status: {
            notIn: [OrderStatus.cancelled, OrderStatus.refunded],
          },
        },
        data: { status: OrderStatus.refund_requested },
      });
      if (claimed.count > 0) {
        // PaymentService is resolved lazily via ModuleRef to avoid circular import.
        try {
          const { PaymentService } =
            await import("../../payment/payment.service");
          const paymentService = this.moduleRef.get(PaymentService, {
            strict: false,
          });
          if (paymentService) {
            await paymentService.processRefund(shipment.orderId);
            this.logger.log(
              `Auto-refunded order ${shipment.orderId} after Sürat return completion (suratCode=${gonderi.KargonunDurumuSayi})`,
            );
          }
        } catch (error: any) {
          this.logger.error(
            `Failed to auto-refund order ${shipment.orderId} after return: ${error.message}. ` +
              `processRefundedOrders sweep (returned-arm) will retry.`,
          );
        }
      }
    }

    this.logger.log(
      `Shipment ${shipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return true;
  }

  /**
   * Sync Sürat Hareketler (movement events) to ShipmentEvent records.
   * Only creates events that don't already exist (based on timestamp + action).
   */
  private async syncShipmentEvents(
    shipmentId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<void> {
    if (!gonderi.Hareketler || gonderi.Hareketler.length === 0) return;

    const existingEvents = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      select: { occurredAt: true, status: true },
    });

    const existingSet = new Set(
      existingEvents.map((e) => `${e.occurredAt.toISOString()}|${e.status}`),
    );

    // H1: geçersiz IslemTarihi'nde .toISOString() RangeError fırlatıp senkronu
    // düşürüyordu — parse edilemeyen hareket satırını atla, kalanlar işlensin.
    const parsedEvents = gonderi.Hareketler.flatMap((h) => {
      const occurredAt = this.client.parseSuratDate(h.IslemTarihi);
      if (!occurredAt) {
        this.logger.warn(
          `Skipping shipment event with unparseable IslemTarihi "${h.IslemTarihi}" for ${shipmentId}`,
        );
        return [];
      }
      return [{ h, occurredAt }];
    });

    const newEvents = parsedEvents.filter(
      ({ h, occurredAt }) =>
        !existingSet.has(`${occurredAt.toISOString()}|${h.Islem}`),
    );

    if (newEvents.length === 0) return;

    await this.prisma.shipmentEvent.createMany({
      data: newEvents.map(({ h, occurredAt }) => ({
        shipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        occurredAt,
      })),
    });
  }
}
