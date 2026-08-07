import {
  Injectable,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ShipmentStatus } from "@prisma/client";
import {
  CARGO_PROVIDER,
  type CargoProvider,
  type CargoShipmentRequest,
} from "../surat-cargo/cargo-provider";
import { i18nMessage } from "../i18n";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { CarrierCancellationService } from "../surat-cargo/carrier-cancellation.service";

type CargoShipmentDetails = Omit<
  CargoShipmentRequest,
  "idempotencyKey" | "correlationId"
>;

/**
 * Takas Sürat Kargo orkestrasyonu — TradeService'ten birebir taşındı
 * (facade-delege deseni; order split'teki alt-servis düzeniyle aynı).
 * Inbound (kullanıcı → depo) etiket/sevkiyat oluşturma, takas iptalinde
 * Sürat gönderilerini yerelde iptal etme ve teslimat adresi çözümü burada yaşar.
 */
@Injectable()
export class TradeShipmentService {
  private readonly logger = new Logger(TradeShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    @Optional()
    @Inject(CARGO_PROVIDER)
    private readonly cargo?: CargoProvider,
    @Optional()
    private readonly carrierCancellations?: CarrierCancellationService,
  ) {}

  /**
   * Cancel any Sürat shipments associated with a trade locally (best-effort).
   * Used when a trade is cancelled after admin warehouse approval (i.e. there
   * are from_warehouse shipments already submitted to Sürat).
   */
  async cancelSuratShipmentsForTrade(tradeId: string): Promise<void> {
    if (!this.cargo || !this.cargo.isEnabled() || !this.carrierCancellations) {
      return;
    }
    try {
      const shipments = await this.prisma.tradeShipment.findMany({
        where: {
          tradeId,
          carrier: "surat",
          status: {
            notIn: ["delivered", "returned", "cancelled"] as any,
          },
          trackingNumber: { not: null },
        },
      });
      for (const shipment of shipments) {
        if (!shipment.trackingNumber) continue;
        try {
          const task = await this.carrierCancellations.request({
            provider: "surat",
            reference: shipment.trackingNumber,
            entityType: "trade_shipment",
            entityId: shipment.id,
            reason: "trade_cancelled",
            metadata: {
              tradeId,
              leg: shipment.leg,
              previousStatus: shipment.status,
            },
            updateLocal: async (tx) => {
              await tx.tradeShipment.update({
                where: { id: shipment.id },
                data: { status: "cancelled" as any },
              });
            },
          });
          this.logger.log(
            `Surat trade shipment locally cancelled: ${shipment.trackingNumber}; ` +
              `carrier cancellation task=${task.id}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to cancel Surat trade shipment ${shipment.trackingNumber}: ${err.message}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `cancelSuratShipmentsForTrade failed for ${tradeId}: ${error.message}`,
      );
    }
  }

  /**
   * Auto-create the two `to_warehouse` TradeShipment rows (one per side) and
   * dispatch them to Sürat Kargo. Called after a trade transitions to
   * `shipping_to_warehouse` (either via accept for non-cash, or via successful
   * cash payment).
   *
   * Behaviour:
   *   - Pre-generates `OzelKargoTakipNo` as `{tradeNumber}-WH-{INI|REC}`.
   *   - Creates the rows in a single short transaction (no Sürat call inside).
   *   - After the tx commits, calls `submitShipmentWithRetry` per side. On
   *     failure, the row is left at `pending` and a warning is logged so the
   *     admin can intervene.
   *   - If a side has no default address, the shipment row is skipped and a
   *     warning is logged. Trade acceptance is NOT blocked.
   *   - Idempotent: if rows already exist for this trade & leg, no-ops.
   *
   * Never throws — all errors are swallowed/logged so callers can fire-and-forget.
   */
  /**
   * Takas için bir tarafın teslimat adresini çözer ve doğrular.
   *   - `providedId` verilmişse: o adresin gerçekten kullanıcıya ait olduğunu
   *     doğrular (değilse hata).
   *   - Verilmemişse: kullanıcının varsayılan (yoksa en eski) adresine düşer.
   *   - Hiç adres yoksa: net bir hata fırlatır (sessiz kırılma yerine kullanıcı
   *     "adres ekle" yönlendirmesi alır).
   */
  async resolveTradeShippingAddressId(
    userId: string,
    providedId?: string,
    opts?: { required?: boolean; db?: any },
  ): Promise<string | null> {
    const db = opts?.db ?? this.prisma;
    const required = opts?.required ?? true;
    if (providedId) {
      const addr = await db.address.findFirst({
        where: { id: providedId, userId },
        select: { id: true },
      });
      if (!addr) {
        throw new BadRequestException(
          i18nMessage("server.trade.selectedAddressNotFound"),
        );
      }
      return addr.id;
    }
    const fallback = await db.address.findFirst({
      where: { userId },
      orderBy: { isDefault: "desc" },
      select: { id: true },
    });
    if (!fallback) {
      if (required) {
        throw new BadRequestException(
          i18nMessage("server.trade.noShippingAddress"),
        );
      }
      return null;
    }
    return fallback.id;
  }

  async createInboundTradeShipments(tradeId: string): Promise<void> {
    try {
      // Resolve trade + sides + addresses outside the create-tx so we don't
      // hold the DB lock while doing reads.
      const trade = await this.prisma.trade.findUnique({
        where: { id: tradeId },
        include: {
          initiator: {
            include: {
              addresses: {
                where: { isDefault: true },
                take: 1,
              },
            },
          },
          receiver: {
            include: {
              addresses: {
                where: { isDefault: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!trade) {
        this.logger.error(
          `createInboundTradeShipments: trade ${tradeId} not found`,
        );
        return;
      }

      // Adres önceliği: takasta SEÇİLEN adres (initiator/receiverAddressId) →
      // varsayılan adres → en eski adres. (Geriye dönük uyum için fallback'ler.)
      const resolveSideAddress = async (
        chosenId: string | null,
        userId: string,
        defaultAddr: any,
      ) => {
        if (chosenId) {
          const chosen = await this.prisma.address.findFirst({
            where: { id: chosenId, userId },
          });
          if (chosen) return chosen;
        }
        return (
          defaultAddr ??
          (await this.prisma.address.findFirst({
            where: { userId },
            orderBy: { createdAt: "asc" },
          }))
        );
      };
      const initiatorAddress = await resolveSideAddress(
        trade.initiatorAddressId,
        trade.initiatorId,
        trade.initiator.addresses[0],
      );
      const receiverAddress = await resolveSideAddress(
        trade.receiverAddressId,
        trade.receiverId,
        trade.receiver.addresses[0],
      );

      type SideKey = "INI" | "REC";
      type Side = {
        suffix: SideKey;
        shipperId: string;
        user: { displayName: string | null; email: string };
        address: typeof initiatorAddress;
      };
      const sides: Side[] = [
        {
          suffix: "INI",
          shipperId: trade.initiatorId,
          user: trade.initiator,
          address: initiatorAddress,
        },
        {
          suffix: "REC",
          shipperId: trade.receiverId,
          user: trade.receiver,
          address: receiverAddress,
        },
      ];

      // Build the create-or-fetch result for each side inside a tx so we don't
      // accidentally double-create on retry. Idempotent on (tradeId, shipperId, leg).
      const dispatched: Array<{
        shipmentId: string;
        ozelKargoTakipNo: string;
        payload: CargoShipmentDetails | null;
      }> = [];

      await this.prisma.$transaction(async (tx) => {
        // ROBUSTNESS: Bu fonksiyon fire-and-forget (accept/payment sonrası) çalışır;
        // ilk okuma (yukarıda) ile bu tx arasında takas silinmiş/iptal edilmiş olabilir
        // (ör. eşzamanlı iptal ya da test truncate). tradeShipment.tradeId FK'sını
        // ihlal edip tüm tx'i patlatmak yerine (trade_shipments_trade_id_fkey), tx içinde
        // takasın hâlâ var olduğunu doğrula; yoksa sessizce çık.
        const stillExists = await tx.trade.findUnique({
          where: { id: trade.id },
          select: { id: true },
        });
        if (!stillExists) {
          this.logger.warn(
            `createInboundTradeShipments: trade ${trade.id} vanished before shipment create; skipping`,
          );
          return;
        }

        for (const side of sides) {
          if (!side.address) {
            // M5: bildirim tx DIŞINDA atılır (aşağıda) — burada yalnız logla+atla.
            this.logger.warn(
              `Trade ${trade.tradeNumber} side ${side.suffix} (user=${side.shipperId}) has no address; inbound shipment NOT created — user notified to add one`,
            );
            continue;
          }

          // Bu taraf için to_warehouse satırı VARSA yeniden kullan, YOKSA oluştur.
          // (Tek kaynak: artık ayrı bir "warehouse-shipments" helper'ı yok; etiket
          // oluşturma + adres + Sürat sevkiyatı yalnız burada yapılır.)
          let row = await tx.tradeShipment.findFirst({
            where: {
              tradeId: trade.id,
              shipperId: side.shipperId,
              leg: "to_warehouse",
            },
          });

          if (row) {
            // Eski/yarım kalmış satır adres içermiyorsa şimdi doldur.
            if (!row.fromAddressId) {
              row = await tx.tradeShipment.update({
                where: { id: row.id },
                data: { fromAddressId: side.address.id },
              });
            }
          } else {
            // tradeNumber zaten "TKS-..." önekini taşır; ikinci bir önek eklenmez.
            const ozelKargoTakipNo = `${trade.tradeNumber}-WH-${side.suffix}`
              .replace(/[^a-zA-Z0-9-]/g, "")
              .slice(0, 50);
            row = await tx.tradeShipment.create({
              data: {
                tradeId: trade.id,
                shipperId: side.shipperId,
                fromAddressId: side.address.id,
                carrier: "surat",
                trackingNumber: ozelKargoTakipNo,
                status: ShipmentStatus.label_created,
                leg: "to_warehouse",
                recipientType: "warehouse",
                recipientUserId: null,
              },
            });
          }

          const payload = this.buildSuratPayloadForInboundLeg(
            side.user,
            side.address,
            row.trackingNumber,
            trade.tradeNumber,
          );

          dispatched.push({
            shipmentId: row.id,
            ozelKargoTakipNo: row.trackingNumber,
            payload,
          });
        }
      });

      // M5: adressiz taraf sessizce atlanıyordu — takas deadline'a kadar askıda
      // kalıyor, kimseye haber gitmiyordu. Kullanıcıya "adres ekle" bildirimi at
      // (in_app + push, şablon TRADE_ADDRESS_REQUIRED). Reconciliation cron bu
      // fonksiyonu periyodik yeniden çağırdığından cache ile günde bire dedupe
      // edilir; adres eklenince kargo otomatik oluşur ve bildirim kesilir.
      for (const side of sides) {
        if (side.address) continue;
        const dedupeKey = `trade:addr-missing-notified:${trade.id}:${side.shipperId}`;
        try {
          if (await this.cache.get(dedupeKey)) continue;
          await this.cache.set(dedupeKey, 1, { ttl: 24 * 3600 });
          await this.notificationService.createInAppNotification(
            side.shipperId,
            NotificationType.TRADE_ADDRESS_REQUIRED,
            { tradeId: trade.id, tradeNumber: trade.tradeNumber },
          );
        } catch (err: any) {
          this.logger.warn(
            `TRADE_ADDRESS_REQUIRED notify failed trade=${trade.id} user=${side.shipperId}: ${err?.message}`,
          );
        }
      }

      // Now, OUTSIDE the tx, run the documented Sürat create+tracking flow. Each is wrapped in
      // try/catch so one failure doesn't block the other side.
      if (!this.cargo || !this.cargo.isEnabled()) {
        this.logger.log(
          `Sürat integration disabled; ${dispatched.length} inbound shipments for trade ${tradeId} left at label_created without remote dispatch`,
        );
        return;
      }

      for (const item of dispatched) {
        if (!item.payload) continue;
        try {
          const result = await this.cargo.createShipment({
            idempotencyKey: `surat:trade-inbound:${item.ozelKargoTakipNo}`,
            correlationId: `trade-inbound-${tradeId}`,
            ...item.payload,
          });
          if (result.ok) {
            // Persist the REAL Sürat cargo code + label (KargoTakipNo).
            await this.prisma.tradeShipment
              .update({
                where: { id: item.shipmentId },
                data: {
                  providerTrackingId: result.trackingCode,
                  labelZpl: result.labelData,
                },
              })
              .catch((e) =>
                this.logger.error(
                  `Failed to persist barcode for trade shipment ${item.shipmentId}: ${e.message}`,
                ),
              );
          }
          if (!result.ok) {
            const r = result as any;
            const errMsg =
              r.kind === "business" ? r.message : `technical:${r.code}`;
            this.logger.warn(
              `Sürat inbound submit non-ok for trade ${tradeId} oid=${item.ozelKargoTakipNo}: ${errMsg}; leaving shipment at label_created for admin review`,
            );
            // Mark shipment as pending so admin queue can flag it.
            await this.prisma.tradeShipment
              .update({
                where: { id: item.shipmentId },
                data: { status: ShipmentStatus.pending },
              })
              .catch((e) =>
                this.logger.error(
                  `Failed to mark shipment ${item.shipmentId} pending: ${e.message}`,
                ),
              );
          } else {
            this.logger.log(
              `Sürat inbound submit OK trade=${tradeId} oid=${item.ozelKargoTakipNo}`,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Sürat inbound submit threw for trade ${tradeId} oid=${item.ozelKargoTakipNo}: ${err?.message ?? err}`,
          );
          await this.prisma.tradeShipment
            .update({
              where: { id: item.shipmentId },
              data: { status: ShipmentStatus.pending },
            })
            .catch(() => undefined);
        }
      }
    } catch (error: any) {
      this.logger.error(
        `createInboundTradeShipments failed for ${tradeId}: ${error?.message ?? error}`,
      );
    }
  }

  /**
   * Build the Sürat REST payload for an inbound (user → Tarodan warehouse) leg.
   * Mirrors `admin.service.ts#approveWarehouseTrade` payload (lines 4514-4533),
   * but the recipient is the Tarodan warehouse — Sürat uses the recipient
   * fields, so the user's address fills the sender side at the branch they
   * physically drop off at.
   *
   * For inbound legs, the user goes to the nearest Sürat branch with the
   * `OzelKargoTakipNo`; Sürat picks up and routes to the warehouse. The
   * payload describes the SHIPMENT (recipient = warehouse), so we write the
   * warehouse address into KisiKurum/Adres/Il/Ilce/TelefonCep.
   */
  private buildSuratPayloadForInboundLeg(
    user: { displayName: string | null; email: string },
    fromAddress: {
      fullName?: string | null;
      phone?: string | null;
      city?: string | null;
      district?: string | null;
      address?: string | null;
    } | null,
    ozelKargoTakipNo: string,
    tradeNumber: string,
  ): CargoShipmentDetails | null {
    if (!fromAddress) return null;

    // Sürat payload fields below describe the destination (alıcı). For inbound
    // legs, destination is the Tarodan warehouse. We pull warehouse contact
    // info from env so non-cash trades & cash trades alike share the same
    // source. Defaults match Tarodan HQ (override via env).
    const warehouseName =
      process.env.TARODAN_WAREHOUSE_NAME?.trim() || "Tarodan Depo";
    const warehouseAddress =
      process.env.TARODAN_WAREHOUSE_ADDRESS?.trim() ||
      "Tarodan Merkez Depo Adresi";
    const warehouseCity =
      process.env.TARODAN_WAREHOUSE_CITY?.trim() || "Istanbul";
    const warehouseDistrict =
      process.env.TARODAN_WAREHOUSE_DISTRICT?.trim() || "Maltepe";
    const warehousePhone =
      process.env.TARODAN_WAREHOUSE_PHONE?.trim() || "05000000000";

    const senderLabel =
      fromAddress.fullName ||
      user?.displayName ||
      user?.email ||
      "Takas Gönderici";

    // warehouseName zaten `?.trim() || "Tarodan Depo"` → daima boş olmayan trimli
    // değer; builder'ın `KisiKurum.trim() || "Alıcı"` mantığı burada no-op olur.
    return {
      reference: ozelKargoTakipNo,
      recipient: {
        name: warehouseName,
        address: warehouseAddress,
        city: warehouseCity,
        district: warehouseDistrict,
        phone: warehousePhone,
      },
      content: `Takas Inbound: ${tradeNumber} (Gönderen: ${senderLabel})`,
    };
  }

  /**
   * Kargo kodu retry job: kodsuz (providerTrackingId NULL) kalmış tek bir
   * depoya-giriş (to_warehouse) takas gönderisi için resmi create+tracking akışını
   * dener. İlk oluşturmadaki payload builder'ı + idempotency anahtarını AYNEN
   * kullanır → Sürat'ta mükerrer gönderi oluşmaz. Başarılıysa kodu+etiketi yazar
   * ve gönderiyi (pending'e düşmüşse) label_created'a çeker. SuratTrackingService
   * orchestrator'ı çağırır; hiçbir zaman throw etmez, boolean döner.
   */
  async retryInboundBarcode(tradeShipmentId: string): Promise<boolean> {
    if (!this.cargo?.isEnabled()) return false;

    const ship = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
      include: {
        trade: { select: { tradeNumber: true } },
        fromAddress: true,
      },
    });
    // Guard: yalnız kodsuz, adresli, Sürat'lı depoya-giriş bacağı.
    if (
      !ship ||
      ship.carrier !== "surat" ||
      ship.providerTrackingId ||
      ship.leg !== "to_warehouse" ||
      !ship.trackingNumber ||
      !ship.fromAddress
    ) {
      return false;
    }

    // shipper bir relation değil (yalnız shipperId scalar) → kullanıcıyı ayrı yükle.
    const shipper = await this.prisma.user.findUnique({
      where: { id: ship.shipperId },
      select: { displayName: true, email: true },
    });

    const payload = this.buildSuratPayloadForInboundLeg(
      shipper ?? { displayName: null, email: "" },
      ship.fromAddress,
      ship.trackingNumber,
      ship.trade.tradeNumber,
    );
    if (!payload) return false;

    try {
      const result = await this.cargo.createShipment({
        idempotencyKey: `surat:trade-inbound:${ship.trackingNumber}`,
        correlationId: `trade-inbound-retry-${ship.tradeId}`,
        ...payload,
      });
      if (!result.ok) {
        const r = result as any;
        this.logger.warn(
          `Retry inbound barcode non-ok trade-shipment=${tradeShipmentId} oid=${ship.trackingNumber}: ${r.kind === "business" ? r.message : `technical:${r.code}`}`,
        );
        return false;
      }
      await this.prisma.tradeShipment.update({
        where: { id: tradeShipmentId },
        data: {
          providerTrackingId: result.trackingCode,
          labelZpl: result.labelData,
          status: ShipmentStatus.label_created,
        },
      });
      this.logger.log(
        `Retry OK: trade inbound barcode filled ${tradeShipmentId} oid=${ship.trackingNumber} code=${result.trackingCode}`,
      );
      // A2/C24: kod gecikmeli oluştu — gönderen "hazırlanıyor" görüp bekliyordu;
      // artık şubeye gidebilir, haber ver.
      try {
        await this.notificationService.createInAppNotification(
          ship.shipperId,
          NotificationType.CARGO_CODE_READY,
          {
            reference: ship.trade.tradeNumber,
            // Hedef `tradeId`den merkezî çözümleyici tarafından üretilir;
            // burada serbest link göndermek web'de olmayan `/trades/:id`
            // yolunu kaydediyordu.
            tradeId: ship.tradeId,
          },
        );
      } catch (err: any) {
        this.logger.warn(
          `CARGO_CODE_READY notify failed trade-shipment=${tradeShipmentId}: ${err?.message}`,
        );
      }
      return true;
    } catch (e: any) {
      this.logger.error(
        `Retry inbound barcode threw ${tradeShipmentId}: ${e?.message}`,
      );
      return false;
    }
  }
}
