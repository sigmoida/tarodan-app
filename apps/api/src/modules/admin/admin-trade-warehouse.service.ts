import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { ApproveWarehouseTradeDto, RejectWarehouseTradeDto } from "./dto";
import { TradeStatus, ShipmentStatus } from "@prisma/client";
import { PaymentService } from "../payment/payment.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { EventService } from "../events/event.service";
import {
  CARGO_PROVIDER,
  type CargoProvider,
} from "../surat-cargo/cargo-provider";
import { AdminTradeCommonService } from "./admin-trade-common.service";
import { startTradeConfirmationWindowIfDelivered } from "../../common/helpers/trade-escrow";
import { TRADE_VALID_TRANSITIONS } from "../trade/trade.state-machine";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";

/**
 * Safe-trade (depo escrow) admin akışının depo-tarafı: depo teslim alma
 * (markWarehouseReceived), onay (approveWarehouseTrade) ve red
 * (rejectWarehouseTrade) — AdminTradeService'ten birebir taşındı.
 * AdminTradeService ince alt-facade olarak buraya delege eder. Depo adresi
 * çözümü paylaşıldığı için AdminTradeCommonService'e delege edilir.
 * DI grafı asiklik: warehouse -> common (leaf); forwardRef yok.
 */
@Injectable()
export class AdminTradeWarehouseService {
  private readonly logger = new Logger(AdminTradeWarehouseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    private readonly common: AdminTradeCommonService,
    @Optional()
    @Inject(CARGO_PROVIDER)
    private readonly cargo?: CargoProvider,
  ) {}

  /**
   * Takasta bir tarafın teslimat adresini çözer: önce takasta SEÇİLEN adres
   * (Trade.initiator/receiverAddressId), yoksa kullanıcının varsayılan adresi.
   */
  private async pickTradeSideAddress(
    tx: any,
    chosenId: string | null,
    userId: string,
  ): Promise<any> {
    if (chosenId) {
      const chosen = await tx.address.findFirst({
        where: { id: chosenId, userId },
      });
      if (chosen) return chosen;
    }
    return tx.address.findFirst({
      where: { userId },
      orderBy: { isDefault: "desc" },
    });
  }

  /**
   * Sürat submit helper for the reject return leg. Falls back to an internal
   * tracking number when the integration is disabled.
   */
  private async submitReturnToSuratForReject(
    tradeId: string,
    oid: string,
    address: any,
    user: any,
  ): Promise<{
    carrier: string;
    trackingNumber: string;
    providerTrackingId: string | null;
    labelZpl: string | null;
  }> {
    if (!this.cargo || !this.cargo.isEnabled()) {
      const fallbackTracking = generateReferenceCode(
        REFERENCE_PREFIX.shipmentFallback,
      );
      return {
        carrier: "Tarodan Warehouse",
        trackingNumber: fallbackTracking,
        providerTrackingId: null,
        labelZpl: null,
      };
    }
    const result = await this.cargo.createShipment({
      idempotencyKey: `surat:trade-return:${oid}`,
      correlationId: `trade-reject-${tradeId}`,
      reference: oid,
      recipient: {
        name: address.fullName || user?.displayName || "Takas İade",
        address: address.address,
        city: address.city,
        district: address.district,
        phone: address.phone,
      },
      content: "Takas İade Gönderisi",
      isReturn: true,
    });
    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === "business" ? r.message : `technical: ${r.code}`;
      throw new BadRequestException(
        `Sürat iade kargo siparişi reddedildi: ${errMsg}`,
      );
    }
    return {
      carrier: "surat",
      trackingNumber: oid,
      providerTrackingId: result.trackingCode,
      labelZpl: result.labelData,
    };
  }

  /**
   * Çıkış (depo → kullanıcı) bacağının Sürat gönderimi. Onay akışı bunu
   * transaction DIŞINDA çağırır; iade gönderiminin (`submitReturnToSurat-
   * ForReject`) simetriğidir ve aynı idempotency anahtarını korur.
   */
  private async submitOutboundToSurat(
    tradeId: string,
    oid: string,
    address: any,
    user: any,
  ): Promise<{
    carrier: string;
    trackingNumber: string;
    providerTrackingId: string | null;
    labelZpl: string | null;
  }> {
    if (!this.cargo || !this.cargo.isEnabled()) {
      return {
        carrier: "Tarodan Warehouse",
        trackingNumber: generateReferenceCode(
          REFERENCE_PREFIX.shipmentFallback,
        ),
        providerTrackingId: null,
        labelZpl: null,
      };
    }
    const result = await this.cargo.createShipment({
      idempotencyKey: `surat:trade:${oid}`,
      correlationId: `trade-approve-${tradeId}`,
      reference: oid,
      recipient: {
        name: address.fullName || user?.displayName || "Takas Alıcısı",
        address: address.address,
        city: address.city,
        district: address.district,
        phone: address.phone,
      },
      content: "Takas Gönderisi",
    });
    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === "business" ? r.message : `technical: ${r.code}`;
      throw new BadRequestException(
        `Sürat kargo onay siparişi reddedildi: ${errMsg}`,
      );
    }
    return {
      carrier: "surat",
      trackingNumber: oid,
      providerTrackingId: result.trackingCode,
      labelZpl: result.labelData,
    };
  }

  /**
   * Kodsuz kalmış tek bir `from_warehouse` bacağı için Sürat submit'ini
   * yeniden dener — iade bacağındaki `retryReturnBarcode`'un eşi. OID
   * deterministik türetilir (üretimdeki formatla BİREBİR), böylece idempotency
   * anahtarı kaymaz. Throw etmez, boolean döner.
   */
  async retryOutboundBarcode(tradeShipmentId: string): Promise<boolean> {
    if (!this.cargo || !this.cargo.isEnabled()) {
      return false;
    }

    const ship = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
      include: {
        trade: {
          select: {
            tradeNumber: true,
            initiatorId: true,
            initiatorAddressId: true,
            receiverAddressId: true,
          },
        },
      },
    });
    if (
      !ship ||
      ship.leg !== "from_warehouse" ||
      ship.providerTrackingId ||
      !ship.recipientUserId ||
      !["pending", "surat"].includes(ship.carrier) ||
      ship.status === ShipmentStatus.cancelled
    ) {
      return false;
    }

    const isInitiator = ship.recipientUserId === ship.trade.initiatorId;
    const oid =
      ship.trackingNumber ??
      `${ship.trade.tradeNumber}-${isInitiator ? "INI" : "REC"}`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);

    const [user, address] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ship.recipientUserId } }),
      this.pickTradeSideAddress(
        this.prisma,
        isInitiator
          ? ship.trade.initiatorAddressId
          : ship.trade.receiverAddressId,
        ship.recipientUserId,
      ),
    ]);
    if (!address) {
      this.logger.warn(
        `Retry outbound barcode: recipient ${ship.recipientUserId} has no address (trade-shipment=${tradeShipmentId})`,
      );
      return false;
    }

    try {
      const submitted = await this.submitOutboundToSurat(
        ship.tradeId,
        oid,
        address,
        user,
      );
      await this.prisma.tradeShipment.update({
        where: { id: tradeShipmentId },
        data: {
          carrier: submitted.carrier,
          trackingNumber: submitted.trackingNumber,
          providerTrackingId: submitted.providerTrackingId,
          labelZpl: submitted.labelZpl,
          status: ShipmentStatus.label_created,
          shippedAt: ship.shippedAt ?? new Date(),
        },
      });
      this.logger.log(
        `Retry OK: trade outbound barcode filled ${tradeShipmentId} oid=${oid}`,
      );
      return true;
    } catch (e: any) {
      this.logger.warn(
        `Retry outbound barcode failed ${tradeShipmentId} oid=${oid}: ${e?.message}`,
      );
      return false;
    }
  }

  /**
   * H3 — Kargo kodu retry: kodsuz kalmış tek bir `return` bacağı (reject'in
   * RET-INI/RET-REC DRAFT'ları veya force-cancel'ın RET-STK DRAFT'ı) için Sürat
   * submit'ini yeniden dener. Sürat timeout'unda DRAFT satır korunuyor ama ne
   * poller (trackingNumber null) ne inbound-retry (yalnız to_warehouse) ona
   * dokunuyordu; reject'in idempotency guard'ı da re-submit etmeden erken
   * dönüyordu → kullanıcı iade etiketini hiç alamıyordu.
   *
   * OID deterministik yeniden türetilir (orijinal formatla BİREBİR — idempotency
   * OzelKargoTakipNo üzerinden): trackingNumber varsa o; yoksa trade'in return
   * bacağı sayısına göre reject (2 bacak → RET-INI/REC, recipient'a göre) veya
   * stuck (1 bacak → RET-STK). Manuel fallback satırları ("Tarodan Warehouse")
   * bilinçli — dokunulmaz. Throw etmez, boolean döner.
   */
  async retryReturnBarcode(tradeShipmentId: string): Promise<boolean> {
    if (!this.cargo || !this.cargo.isEnabled()) {
      return false;
    }

    const ship = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
      include: {
        trade: {
          select: {
            tradeNumber: true,
            initiatorId: true,
            receiverId: true,
            initiatorAddressId: true,
            receiverAddressId: true,
          },
        },
      },
    });
    if (
      !ship ||
      ship.leg !== "return" ||
      ship.providerTrackingId ||
      !ship.recipientUserId ||
      !["pending", "surat"].includes(ship.carrier) ||
      ship.status === ShipmentStatus.cancelled
    ) {
      return false;
    }

    // OID: gönderi OLUŞTURULURKEN kullanılan formatla BİREBİR aynı türetim —
    // format burada ve üretim tarafında birlikte değişmezse idempotency
    // anahtarı kayar ve mükerrer gönderi riski doğar.
    let oid = ship.trackingNumber;
    if (!oid) {
      const returnLegCount = await this.prisma.tradeShipment.count({
        where: { tradeId: ship.tradeId, leg: "return" },
      });
      const suffix =
        returnLegCount >= 2
          ? ship.recipientUserId === ship.trade.initiatorId
            ? "RET-INI"
            : "RET-REC"
          : "RET-STK";
      // tradeNumber zaten "TKS-..." önekini taşır; ikinci bir önek eklenmez.
      oid = `${ship.trade.tradeNumber}-${suffix}`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);
    }

    const isInitiator = ship.recipientUserId === ship.trade.initiatorId;
    const [user, address] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ship.recipientUserId } }),
      this.pickTradeSideAddress(
        this.prisma,
        isInitiator
          ? ship.trade.initiatorAddressId
          : ship.trade.receiverAddressId,
        ship.recipientUserId,
      ),
    ]);
    if (!address) {
      this.logger.warn(
        `Retry return barcode: recipient ${ship.recipientUserId} has no address (trade-shipment=${tradeShipmentId})`,
      );
      return false;
    }

    try {
      const submitted = await this.submitReturnToSuratForReject(
        ship.tradeId,
        oid,
        address,
        user,
      );
      await this.prisma.tradeShipment.update({
        where: { id: tradeShipmentId },
        data: {
          carrier: submitted.carrier,
          trackingNumber: submitted.trackingNumber,
          providerTrackingId: submitted.providerTrackingId,
          labelZpl: submitted.labelZpl,
          status: ShipmentStatus.label_created,
          shippedAt: ship.shippedAt ?? new Date(),
        },
      });
      this.logger.log(
        `Retry OK: trade return barcode filled ${tradeShipmentId} oid=${oid} code=${submitted.providerTrackingId}`,
      );
      return true;
    } catch (e: any) {
      this.logger.warn(
        `Retry return barcode failed ${tradeShipmentId} oid=${oid}: ${e?.message}`,
      );
      return false;
    }
  }

  /**
   * Admin marks one of the two to_warehouse shipments as delivered to the
   * Tarodan warehouse. When both to_warehouse shipments are delivered, the
   * trade transitions to `at_warehouse` so admin review can begin.
   */
  async markWarehouseReceived(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        // Lock the trade row for the duration of the transaction
        await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

        const trade = await tx.trade.findUnique({
          where: { id: tradeId },
          select: {
            id: true,
            status: true,
            initiatorId: true,
            receiverId: true,
            firstWarehouseArrivalAt: true,
          },
        });
        if (!trade) {
          throw new NotFoundException("Takas bulunamadı");
        }

        const shipment = await tx.tradeShipment.findUnique({
          where: { id: shipmentId },
        });
        if (!shipment || shipment.tradeId !== tradeId) {
          throw new NotFoundException("Gönderim bulunamadı");
        }
        if (shipment.leg !== "to_warehouse") {
          throw new BadRequestException(
            "Bu gönderim depoya gelen bir gönderim değil",
          );
        }
        if (shipment.deliveredAt) {
          throw new BadRequestException(
            "Bu gönderim zaten teslim alındı olarak işaretlenmiş",
          );
        }
        // Durum makinesi guard'ı (çıkış bacağındaki #86 ile aynı kural): iptal
        // edilmiş / dönüşe çıkmış bir bacak buradan delivered'a ZORLANAMAZ.
        if (
          !canTransitionShipmentStatus(
            shipment.status as ShipmentStatus,
            ShipmentStatus.delivered,
          )
        ) {
          throw new BadRequestException(
            `Gönderim durumu '${shipment.status}' — teslim alındı olarak işaretlenemez`,
          );
        }

        const now = new Date();
        const updatedShipment = await tx.tradeShipment.update({
          where: { id: shipmentId },
          data: {
            status: ShipmentStatus.delivered,
            deliveredAt: now,
          },
        });

        // Check if both to_warehouse shipments are now delivered
        const toWarehouseShipments = await tx.tradeShipment.findMany({
          where: { tradeId, leg: "to_warehouse" },
          select: { id: true, deliveredAt: true },
        });
        const bothDelivered =
          toWarehouseShipments.length >= 2 &&
          toWarehouseShipments.every((s) => s.deliveredAt !== null);

        // Lock user-side cancel on the first warehouse arrival. From this point
        // on, only admin can unwind the trade (reject or force-cancel-stuck).
        // Kapanmış bir takasa (iptal/dönüş/tamamlandı) iptal kilidi damgalamak
        // anlamsız: o takas zaten kullanıcı aksiyonuna kapalı.
        const tradeStillOpen =
          trade.status === TradeStatus.shipping_to_warehouse ||
          trade.status === TradeStatus.at_warehouse;
        const isFirstArrival =
          trade.firstWarehouseArrivalAt === null && tradeStillOpen;

        // Takas durumu at_warehouse'a GEÇEBİLİYORSA geç. Eski kod yalnız "zaten
        // at_warehouse değil" diye bakıyordu: iptal edilmiş / dönüşe çıkmış bir
        // takas, geç gelen bir koli teslim alındığında canlanıp onaylanabilir
        // hale geliyordu (parası çoktan iade edilmiş olmasına rağmen). Sürat
        // poller'ındaki aynı hata #3'te düzeltilmişti; manuel yol açıkta kalmış.
        // FOR UPDATE (yukarıda) okumayı kilitler → whitelist kontrolü CAS'tır.
        const canEnterWarehouse =
          TRADE_VALID_TRANSITIONS[trade.status]?.includes(
            TradeStatus.at_warehouse,
          ) ?? false;

        let nextStatus: TradeStatus = trade.status;
        if (bothDelivered && canEnterWarehouse) {
          await tx.trade.update({
            where: { id: tradeId },
            data: {
              status: TradeStatus.at_warehouse,
              updatedAt: now,
              ...(isFirstArrival
                ? { firstWarehouseArrivalAt: now, cancelLockedAt: now }
                : {}),
            },
          });
          nextStatus = TradeStatus.at_warehouse;
        } else if (isFirstArrival) {
          await tx.trade.update({
            where: { id: tradeId },
            data: {
              firstWarehouseArrivalAt: now,
              cancelLockedAt: now,
              updatedAt: now,
            },
          });
        }

        await this.audit.createAuditLog(
          adminId,
          "trade_warehouse_received",
          "TradeShipment",
          shipmentId,
          shipment,
          {
            ...updatedShipment,
            bothDelivered,
            tradeStatus: nextStatus,
            firstArrival: isFirstArrival,
          },
        );

        return {
          success: true,
          tradeId,
          shipmentId,
          status: nextStatus,
          bothDelivered,
          firstArrival: isFirstArrival,
          initiatorId: trade.initiatorId,
          receiverId: trade.receiverId,
        };
      })
      .then(async (res) => {
        if (res.firstArrival) {
          try {
            await this.eventService.emitTradeCancelLocked({
              tradeId: res.tradeId,
              initiatorId: res.initiatorId,
              receiverId: res.receiverId,
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit trade.cancel-locked for trade ${res.tradeId}: ${err}`,
            );
          }
        }
        // İki koli de depoda: taraflara haber ver. Bu bildirim olmadan süreç,
        // kullanıcı açısından "iptal edemezsin" uyarısından sonra sessizleşiyor
        // ve kontrol bitene kadar hiçbir sinyal gelmiyordu.
        if (res.status === TradeStatus.at_warehouse) {
          await this.notifyTradeAtWarehouse(
            res.tradeId,
            res.initiatorId,
            res.receiverId,
          );
        }
        return res;
      });
  }

  /**
   * Admin, ÇIKIŞ (depo → kullanıcı) kolisini elle "teslim edildi" işaretler —
   * giriş bacağındaki markWarehouseReceived'ın simetriği.
   *
   * Neden gerekli: escrow onay penceresi artık TESLİMATTAN başlıyor. Taşıyıcı
   * teslimi hiç raporlamazsa (yanlış takip no, Sürat kaydı düşmemiş) ve
   * kullanıcı da onaylamazsa takas askıda kalırdı. notifyAdminsOfUndelivered-
   * OutboundTrades alarmı bu ucu işaret eder: admin fiziksel teslimi doğrulayıp
   * işaretler, iki koli de teslim olunca pencere normal akışında başlar.
   */
  async markOutboundDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true },
      });
      if (!trade) {
        throw new NotFoundException("Takas bulunamadı");
      }
      if (trade.status !== TradeStatus.shipping_to_recipients) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' — yalnız 'shipping_to_recipients' takasta çıkış kolisi teslim işaretlenebilir`,
        );
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException("Gönderim bulunamadı");
      }
      if (shipment.leg !== "from_warehouse") {
        throw new BadRequestException(
          "Bu gönderim depodan çıkan bir gönderim değil",
        );
      }

      const now = new Date();
      let updatedShipment = shipment;
      if (!shipment.deliveredAt) {
        // #86 durum makinesi guard'ı: iptal/dönüş gibi terminal bir bacak
        // buradan delivered'a ZORLANAMAZ — dönen koliyi teslim saymak,
        // helper'daki blok kuralını delip escrow'u açardı.
        if (
          !canTransitionShipmentStatus(
            shipment.status as ShipmentStatus,
            ShipmentStatus.delivered,
          )
        ) {
          throw new BadRequestException(
            `Gönderim durumu '${shipment.status}' — teslim edildi olarak işaretlenemez`,
          );
        }
        updatedShipment = await tx.tradeShipment.update({
          where: { id: shipmentId },
          data: { status: ShipmentStatus.delivered, deliveredAt: now },
        });
      }
      // deliveredAt zaten doluysa hata YOK: bu uç, "koliler teslim ama pencere
      // kurulamadı" alarmının onarım aracıdır — o durumda yalnız pencere
      // kurulumuna düşer (idempotent), tarih ötelenmez.

      // İki koli de teslimse onay/itiraz penceresi buradan başlar (tek kaynak).
      const confirmationDeadline =
        await startTradeConfirmationWindowIfDelivered(tx, tradeId);

      await this.audit.createAuditLog(
        adminId,
        "trade_outbound_delivered",
        "TradeShipment",
        shipmentId,
        shipment,
        {
          ...updatedShipment,
          note: note ?? null,
          confirmationDeadline,
        },
      );

      return {
        success: true,
        tradeId,
        shipmentId,
        confirmationDeadline,
      };
    });
  }

  /**
   * "Ürünler depoda" bildirimi (iki tarafa). Best-effort: bildirim hatası depo
   * akışını bozmaz. Sürat poller'ı da aynı bildirimi kendi geçişinde atar.
   */
  private async notifyTradeAtWarehouse(
    tradeId: string,
    initiatorId: string,
    receiverId: string,
  ): Promise<void> {
    for (const userId of [initiatorId, receiverId]) {
      try {
        await this.notificationService.createInAppNotification(
          userId,
          NotificationType.TRADE_AT_WAREHOUSE,
          { tradeId },
        );
      } catch (err: any) {
        this.logger.warn(
          `TRADE_AT_WAREHOUSE notify failed trade=${tradeId} user=${userId}: ${err?.message}`,
        );
      }
    }
  }

  /**
   * Depo kontrolünü BAŞLATIR: `at_warehouse` → `admin_reviewing`.
   *
   * `admin_reviewing` şemada ve durum makinesinde vardı ama hiçbir kod onu
   * yazmıyordu: "uzman kontrolü" aşamasının veri karşılığı yoktu — kontrolün
   * ne zaman başladığı, kimin baktığı kayıtlı değildi ve kullanıcıya "kontrol
   * ediliyor" diye bir durum gösterilemiyordu. Kontrolü üstlenen operatör bu
   * ucu çağırır; kim/ne zaman bilgisi denetim kaydında durur.
   *
   * İdempotent: zaten `admin_reviewing` ise sessizce aynı sonucu döner.
   */
  async startWarehouseReview(adminId: string, tradeId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true },
      });
      if (!trade) {
        throw new NotFoundException("Takas bulunamadı");
      }
      if (trade.status === TradeStatus.admin_reviewing) {
        return { success: true, tradeId, status: trade.status, already: true };
      }
      if (trade.status !== TradeStatus.at_warehouse) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' — kontrole yalnız 'at_warehouse' takas alınabilir`,
        );
      }

      const updated = await tx.trade.update({
        where: { id: tradeId },
        data: { status: TradeStatus.admin_reviewing, updatedAt: new Date() },
      });

      await this.audit.createAuditLog(
        adminId,
        "trade_warehouse_review_started",
        "Trade",
        tradeId,
        trade,
        updated,
      );

      return { success: true, tradeId, status: updated.status, already: false };
    });
  }

  /**
   * Admin approves the safe-trade after inspecting both items at the
   * warehouse. Creates two outbound shipments (one to each party, carrying
   * the other party's items) and transitions trade to
   * `shipping_to_recipients`.
   */
  async approveWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: ApproveWarehouseTradeDto,
  ) {
    // Idempotency + onarım: takas zaten çıkışa geçtiyse yeniden onaylamaya
    // çalışmak yerine kodsuz kalmış çıkış bacaklarını Sürat'a yeniden gönder
    // (reject yolundaki H3 ile aynı davranış).
    const already = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        status: true,
        shipments: {
          where: { leg: "from_warehouse" },
          select: { id: true, carrier: true, providerTrackingId: true },
        },
      },
    });
    if (!already) {
      throw new NotFoundException("Takas bulunamadı");
    }
    if (
      already.status === TradeStatus.shipping_to_recipients &&
      already.shipments.length >= 2
    ) {
      const incomplete = already.shipments.filter(
        (s) =>
          s.carrier === "pending" ||
          (s.carrier === "surat" && !s.providerTrackingId),
      );
      let resubmitted = 0;
      for (const s of incomplete) {
        if (await this.retryOutboundBarcode(s.id)) resubmitted++;
      }
      return {
        success: true,
        tradeId,
        status: already.status,
        idempotent: true,
        ...(incomplete.length > 0 && {
          outboundResubmitted: resubmitted,
          outboundStillPending: incomplete.length - resubmitted,
        }),
      };
    }

    // 1) Transaction YALNIZCA DB durumu değiştirir: doğrula, DRAFT çıkış
    //    gönderilerini oluştur, statüyü çevir. Sürat çağrıları BİLEREK tx
    //    dışında — üçüncü taraf API'si yavaşladığında takas satırının
    //    FOR UPDATE kilidini tutmamak ve Prisma'nın 5 sn'lik interactive
    //    transaction timeout'una takılmamak için (red yolu ile aynı desen).
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          items: true,
        },
      });
      if (!trade) {
        throw new NotFoundException("Takas bulunamadı");
      }

      if (
        trade.status !== TradeStatus.at_warehouse &&
        trade.status !== TradeStatus.admin_reviewing
      ) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' onay için uygun değil. Beklenen: at_warehouse veya admin_reviewing.`,
        );
      }

      const [initiatorAddress, receiverAddress] = await Promise.all([
        this.pickTradeSideAddress(
          tx,
          trade.initiatorAddressId,
          trade.initiatorId,
        ),
        this.pickTradeSideAddress(
          tx,
          trade.receiverAddressId,
          trade.receiverId,
        ),
      ]);

      if (!initiatorAddress) {
        throw new BadRequestException(
          "Takası başlatan kullanıcının kayıtlı adresi yok",
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          "Takası alan kullanıcının kayıtlı adresi yok",
        );
      }

      const warehouseAddressId =
        await this.common.resolveWarehouseAddressId(tx);

      const now = new Date();

      const initiatorOid = `${trade.tradeNumber}-INI`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);
      const receiverOid = `${trade.tradeNumber}-REC`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);

      // DRAFT satırlar — carrier/trackingNumber Sürat yanıtı geldikten sonra
      // (tx dışında) doldurulur. Sürat patlarsa DRAFT durur ve retry ucu
      // (retryOutboundBarcode) tamamlar; takas onaylanmış sayılır çünkü
      // ürünler fiziksel olarak çıkışa hazırlanmıştır.
      const shipmentToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: "pending",
          trackingNumber: null,
          status: ShipmentStatus.pending,
          shippedAt: now,
          leg: "from_warehouse",
          recipientType: "user",
          recipientUserId: trade.initiatorId,
        },
      });

      const shipmentToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: "pending",
          trackingNumber: null,
          status: ShipmentStatus.pending,
          shippedAt: now,
          leg: "from_warehouse",
          recipientType: "user",
          recipientUserId: trade.receiverId,
        },
      });

      // Onay/itiraz penceresi BURADA başlamaz: saat, koliler TESLİM edildiğinde
      // kurulur (startTradeConfirmationWindowIfDelivered — Sürat teslim poll'u
      // ya da kullanıcının elle onayı). Kargoya veriliş anından saymak, yavaş
      // kargoda takası koli daha yoldayken otomatik tamamlıyor, parayı serbest
      // bırakıyor ve kullanıcıyı itiraz açamaz duruma düşürüyordu.
      //
      // Y12 (süresiz askı) buna rağmen geri gelmez: teslim raporu hiç gelmeyen
      // çıkış kolileri notifyAdminsOfUndeliveredOutboundTrades ile admin'e
      // alarm olarak düşer — teslim kanıtı yokken otomatik tamamlama YAPILMAZ.
      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.shipping_to_recipients,
          confirmationDeadline: null,
          updatedAt: now,
        },
      });

      await this.audit.createAuditLog(
        adminId,
        "trade_warehouse_approve",
        "Trade",
        tradeId,
        trade,
        {
          ...updatedTrade,
          notes: dto?.notes ?? null,
          outboundShipments: [shipmentToInitiator.id, shipmentToReceiver.id],
        },
      );

      return {
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        status: updatedTrade.status,
        outboundDrafts: [
          {
            id: shipmentToInitiator.id,
            oid: initiatorOid,
            address: initiatorAddress,
            recipientUserId: trade.initiatorId,
          },
          {
            id: shipmentToReceiver.id,
            oid: receiverOid,
            address: receiverAddress,
            recipientUserId: trade.receiverId,
          },
        ],
      };
    });

    // 2) Tx dışı: her DRAFT'ı Sürat'a gönder. Sürat OzelKargoTakipNo +
    //    idempotencyKey üzerinde idempotent olduğundan kısmi hatadan sonraki
    //    retry aynı etiketi üretir, mükerrer gönderi doğurmaz.
    for (const draft of result.outboundDrafts) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: draft.recipientUserId },
        });
        const submitted = await this.submitOutboundToSurat(
          tradeId,
          draft.oid,
          draft.address,
          user,
        );
        await this.prisma.tradeShipment.update({
          where: { id: draft.id },
          data: {
            carrier: submitted.carrier,
            trackingNumber: submitted.trackingNumber,
            providerTrackingId: submitted.providerTrackingId,
            labelZpl: submitted.labelZpl,
            status: ShipmentStatus.label_created,
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Sürat outbound submit failed for trade ${tradeId} draft ${draft.id}: ${err?.message}. DRAFT row preserved for retry.`,
        );
      }
    }

    // Emit notifications after transaction commits
    try {
      await this.eventService.emitTradeWarehouseApproved({
        tradeId,
        initiatorId: result.initiatorId,
        receiverId: result.receiverId,
        notes: dto?.notes,
      });
    } catch (err) {
      this.logger.error(
        `Failed to emit trade.warehouse-approved for trade ${tradeId}: ${err}`,
      );
    }

    return { success: true, tradeId, status: result.status };
  }

  /**
   * Admin rejects the safe-trade after inspection. Creates two return
   * shipments (each sending each party's own items back to them), sets
   * the trade to `returning`, and triggers a cash refund if applicable.
   */
  async rejectWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: RejectWarehouseTradeDto,
  ) {
    if (!dto?.reason || !dto.reason.trim()) {
      throw new BadRequestException("Red nedeni zorunludur");
    }

    // Idempotency: if the trade is already `returning` from a prior reject,
    // return the existing result instead of re-running Sürat / refund.
    const existing = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        status: true,
        refundFailureReason: true,
        shipments: {
          where: { leg: "return" },
          select: { id: true, carrier: true, providerTrackingId: true },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException("Takas bulunamadı");
    }
    if (
      existing.status === TradeStatus.returning &&
      existing.shipments.length >= 2
    ) {
      // H3: erken dönüş, Sürat submit'i timeout'ta kalmış kodsuz DRAFT'ları
      // sonsuza dek kilitliyordu ("returning && >=2" hep doğru, ama bacaklar
      // kodsuz). Kodsuz Sürat bacaklarını burada yeniden submit et; manuel
      // fallback ("Tarodan Warehouse") bacakları bilinçli, dokunma.
      const incomplete = existing.shipments.filter(
        (s) =>
          s.carrier === "pending" ||
          (s.carrier === "surat" && !s.providerTrackingId),
      );
      let resubmitted = 0;
      for (const s of incomplete) {
        if (await this.retryReturnBarcode(s.id)) resubmitted++;
      }
      return {
        success: true,
        tradeId,
        status: existing.status,
        refundFailure: existing.refundFailureReason,
        idempotent: true,
        ...(incomplete.length > 0 && {
          returnResubmitted: resubmitted,
          returnStillPending: incomplete.length - resubmitted,
        }),
      };
    }

    // 1) Transaction does ONLY DB state mutation: validate, create DRAFT
    //    return shipments, flip status to `returning`. Sürat calls are
    //    deliberately outside the transaction to avoid holding the trade
    //    row lock across a slow third-party API.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          items: true,
          cashPayments: true,
        },
      });
      if (!trade) {
        throw new NotFoundException("Takas bulunamadı");
      }

      if (
        trade.status !== TradeStatus.at_warehouse &&
        trade.status !== TradeStatus.admin_reviewing
      ) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' reddetme için uygun değil. Beklenen: at_warehouse veya admin_reviewing.`,
        );
      }

      const [initiatorAddress, receiverAddress] = await Promise.all([
        this.pickTradeSideAddress(
          tx,
          trade.initiatorAddressId,
          trade.initiatorId,
        ),
        this.pickTradeSideAddress(
          tx,
          trade.receiverAddressId,
          trade.receiverId,
        ),
      ]);
      if (!initiatorAddress) {
        throw new BadRequestException(
          "Takası başlatan kullanıcının kayıtlı adresi yok",
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          "Takası alan kullanıcının kayıtlı adresi yok",
        );
      }

      const warehouseAddressId =
        await this.common.resolveWarehouseAddressId(tx);
      const now = new Date();

      const initiatorReturnOid = `${trade.tradeNumber}-RET-INI`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);
      const receiverReturnOid = `${trade.tradeNumber}-RET-REC`
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 50);

      // DRAFT rows — carrier/trackingNumber set after the Sürat call returns.
      const returnToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: "pending",
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: "return",
          recipientType: "user",
          recipientUserId: trade.initiatorId,
        },
      });
      const returnToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: "pending",
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: "return",
          recipientType: "user",
          recipientUserId: trade.receiverId,
        },
      });

      // KUSUR: kontrolden geçemeyen ürün kimin ise takası o bozmuştur. Diğer
      // taraf üstüne düşeni eksiksiz yapmıştır → ödemesi hizmet bedeli ve kargo
      // dahil TAM iade edilir (bkz. trade-refund-policy). "neither" operasyonel
      // reddir (ör. bizim hatamız): iki taraf da kusursuzdur.
      const faultlessPayerIds =
        dto.faultySide === "initiator"
          ? [trade.receiverId]
          : dto.faultySide === "receiver"
            ? [trade.initiatorId]
            : dto.faultySide === "neither"
              ? [trade.initiatorId, trade.receiverId]
              : [];
      if (faultlessPayerIds.length > 0) {
        await tx.tradeCashPayment.updateMany({
          where: { tradeId, payerId: { in: faultlessPayerIds } },
          data: { fullRefundEntitled: true },
        });
      }

      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.returning,
          cancelReason: dto.reason,
          updatedAt: now,
        },
      });

      await this.audit.createAuditLog(
        adminId,
        "trade_warehouse_reject",
        "Trade",
        tradeId,
        trade,
        {
          ...updatedTrade,
          reason: dto.reason,
          // Kusur ataması denetim kaydında saklanır: hangi tarafın ürünü
          // elendi sorusu sonradan raporlanabilsin (mali sonuç bugün her iki
          // taraf için aynıdır, bkz. iade matrisi).
          faultySide: dto.faultySide,
          returnShipments: [returnToInitiator.id, returnToReceiver.id],
        },
      );

      return {
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        status: updatedTrade.status,
        warehouseAddressId,
        returnDrafts: [
          {
            id: returnToInitiator.id,
            oid: initiatorReturnOid,
            address: initiatorAddress,
            recipientUserId: trade.initiatorId,
          },
          {
            id: returnToReceiver.id,
            oid: receiverReturnOid,
            address: receiverAddress,
            recipientUserId: trade.receiverId,
          },
        ],
      };
    });

    // 2) Outside the tx: submit each DRAFT to Sürat. Sürat is idempotent on
    //    OzelKargoTakipNo + idempotencyKey, so a retry after a partial
    //    failure produces the same label without duplicating shipments.
    for (const draft of result.returnDrafts) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: draft.recipientUserId },
        });
        const submitted = await this.submitReturnToSuratForReject(
          tradeId,
          draft.oid,
          draft.address,
          user,
        );
        await this.prisma.tradeShipment.update({
          where: { id: draft.id },
          data: {
            carrier: submitted.carrier,
            trackingNumber: submitted.trackingNumber,
            providerTrackingId: submitted.providerTrackingId,
            labelZpl: submitted.labelZpl,
            status: ShipmentStatus.label_created,
            shippedAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Sürat return submit failed for trade ${tradeId} draft ${draft.id}: ${err?.message}. DRAFT row preserved for retry.`,
        );
      }
    }

    // After commit: refund cash payment (if completed) and notify parties.
    // Refund failure does NOT roll back the reject: return shipments are
    // already on their way back to users. Instead, the failure is persisted
    // on the trade so the admin UI can surface a "retry refund" affordance.
    // MONEY: iade HER ZAMAN failure-tracking'li yoldan denenir (marker + retry
    // cron + refund-completed/failed event'leri tracked helper'ın içinde);
    // ödemesiz takasta no-op. Eski shouldRefund kapısı yalnız
    // primaryCashPayment satırına bakıyordu — v2'de asıl ödeyen DİĞER taraf
    // olduğunda iade hiç denenmiyor, marker da yazılmadığı için retry cron'u
    // göremiyordu.
    const refundResult =
      await this.paymentService.refundTradeCashTracked(tradeId);
    const refundFailureMessage = refundResult.failed
      ? (refundResult.reason ?? "Bilinmeyen hata (PayTR iade başarısız)")
      : null;

    try {
      await this.eventService.emitTradeWarehouseRejected({
        tradeId,
        initiatorId: result.initiatorId,
        receiverId: result.receiverId,
        reason: dto.reason,
      });
    } catch (err) {
      this.logger.error(
        `Failed to emit trade.warehouse-rejected for trade ${tradeId}: ${err}`,
      );
    }

    return {
      success: true,
      tradeId,
      status: result.status,
      refundFailure: refundFailureMessage,
    };
  }
}
