import {
  Injectable,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ShipmentStatus } from '@prisma/client';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
  SuratGonderiPayload,
} from '../surat-cargo/surat-cargo.types';

/**
 * Takas Sürat Kargo orkestrasyonu — TradeService'ten birebir taşındı
 * (facade-delege deseni; order split'teki alt-servis düzeniyle aynı).
 * Inbound (kullanıcı → depo) etiket/sevkiyat oluşturma, takas iptalinde
 * Sürat gönderilerini iptal etme ve teslimat adresi çözümü burada yaşar.
 */
@Injectable()
export class TradeShipmentService {
  private readonly logger = new Logger(TradeShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
  ) {}

  /**
   * Cancel any Sürat shipments associated with a trade (best-effort).
   * Used when a trade is cancelled after admin warehouse approval (i.e. there
   * are from_warehouse shipments already submitted to Sürat).
   */
  async cancelSuratShipmentsForTrade(tradeId: string): Promise<void> {
    if (!this.suratCargoService || !this.suratCargoService.isIntegrationEnabled()) {
      return;
    }
    try {
      const shipments = await this.prisma.tradeShipment.findMany({
        where: {
          tradeId,
          carrier: 'surat',
          status: { notIn: ['delivered', 'returned', 'cancelled', 'failed'] as any },
          trackingNumber: { not: null },
        },
      });
      for (const shipment of shipments) {
        if (!shipment.trackingNumber) continue;
        try {
          await this.suratCargoService.cancelShipmentByOrderNumber(shipment.trackingNumber);
          await this.prisma.tradeShipment.update({
            where: { id: shipment.id },
            data: { status: 'cancelled' as any },
          });
          this.logger.log(`Surat trade shipment cancelled: ${shipment.trackingNumber}`);
        } catch (err: any) {
          this.logger.error(
            `Failed to cancel Surat trade shipment ${shipment.trackingNumber}: ${err.message}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`cancelSuratShipmentsForTrade failed for ${tradeId}: ${error.message}`);
    }
  }

  /**
   * Auto-create the two `to_warehouse` TradeShipment rows (one per side) and
   * dispatch them to Sürat Kargo. Called after a trade transitions to
   * `shipping_to_warehouse` (either via accept for non-cash, or via successful
   * cash payment).
   *
   * Behaviour:
   *   - Pre-generates `OzelKargoTakipNo` as `TRD-{tradeNumber}-WH-{INI|REC}`.
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
          'Seçilen teslimat adresi bulunamadı veya size ait değil.',
        );
      }
      return addr.id;
    }
    const fallback = await db.address.findFirst({
      where: { userId },
      orderBy: { isDefault: 'desc' },
      select: { id: true },
    });
    if (!fallback) {
      if (required) {
        throw new BadRequestException(
          'Takas için bir teslimat adresi ekleyin. Profil → Adreslerim üzerinden adres ekleyebilirsiniz.',
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
            orderBy: { createdAt: 'asc' },
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

      type SideKey = 'INI' | 'REC';
      type Side = {
        suffix: SideKey;
        shipperId: string;
        user: { displayName: string | null; email: string };
        address: typeof initiatorAddress;
      };
      const sides: Side[] = [
        {
          suffix: 'INI',
          shipperId: trade.initiatorId,
          user: trade.initiator,
          address: initiatorAddress,
        },
        {
          suffix: 'REC',
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
        payload: SuratGonderiPayload | null;
      }> = [];

      await this.prisma.$transaction(async (tx) => {
        for (const side of sides) {
          if (!side.address) {
            this.logger.warn(
              `Trade ${trade.tradeNumber} side ${side.suffix} (user=${side.shipperId}) has no address; inbound shipment NOT created — admin must intervene`,
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
              leg: 'to_warehouse',
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
            // tradeNumber zaten "TRD-..." formatında geliyor; çift "TRD-" önekini
            // önlemek için doğrudan tradeNumber'ı kullan.
            const ozelKargoTakipNo = `${trade.tradeNumber}-WH-${side.suffix}`
              .replace(/[^a-zA-Z0-9-]/g, '')
              .slice(0, 50);
            row = await tx.tradeShipment.create({
              data: {
                tradeId: trade.id,
                shipperId: side.shipperId,
                fromAddressId: side.address.id,
                carrier: 'surat',
                trackingNumber: ozelKargoTakipNo,
                status: ShipmentStatus.label_created,
                leg: 'to_warehouse',
                recipientType: 'warehouse',
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

      // Now, OUTSIDE the tx, fire the Sürat SOAP calls. Each is wrapped in
      // try/catch so one failure doesn't block the other side.
      if (
        !this.suratCargoService ||
        !this.suratCargoService.isIntegrationEnabled()
      ) {
        this.logger.log(
          `Sürat integration disabled; ${dispatched.length} inbound shipments for trade ${tradeId} left at label_created without remote dispatch`,
        );
        return;
      }

      for (const item of dispatched) {
        if (!item.payload) continue;
        try {
          const result = await this.suratCargoService.submitShipmentWithRetry({
            idempotencyKey: `surat:trade-inbound:${item.ozelKargoTakipNo}`,
            correlationId: `trade-inbound-${tradeId}`,
            payload: item.payload,
          });
          if (!result.ok) {
            const r = result as any;
            const errMsg =
              r.kind === 'business'
                ? r.suratMessage
                : `technical:${r.code}`;
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
   * Build the Sürat SOAP payload for an inbound (user → Tarodan warehouse) leg.
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
  ): SuratGonderiPayload | null {
    if (!fromAddress) return null;

    // Sürat payload fields below describe the destination (alıcı). For inbound
    // legs, destination is the Tarodan warehouse. We pull warehouse contact
    // info from env so non-cash trades & cash trades alike share the same
    // source. Defaults match Tarodan HQ (override via env).
    const warehouseName =
      process.env.TARODAN_WAREHOUSE_NAME?.trim() || 'Tarodan Depo';
    const warehouseAddress =
      process.env.TARODAN_WAREHOUSE_ADDRESS?.trim() ||
      'Tarodan Merkez Depo Adresi';
    const warehouseCity =
      process.env.TARODAN_WAREHOUSE_CITY?.trim() || 'Istanbul';
    const warehouseDistrict =
      process.env.TARODAN_WAREHOUSE_DISTRICT?.trim() || 'Maltepe';
    const warehousePhone =
      process.env.TARODAN_WAREHOUSE_PHONE?.trim() || '05000000000';

    const senderLabel =
      fromAddress.fullName || user?.displayName || user?.email || 'Takas Gönderici';

    return {
      KisiKurum: warehouseName,
      SahisBirim: `Takas Inbound: ${tradeNumber} (Gönderen: ${senderLabel})`,
      AliciAdresi: warehouseAddress,
      Il: normalizeSuratLocation(warehouseCity),
      Ilce: normalizeSuratLocation(warehouseDistrict),
      TelefonCep: normalizeSuratPhone(warehousePhone),
      KargoTuru: SuratKargoTuru.Koli,
      OdemeTipi: SuratOdemeTipi.Pesin,
      OzelKargoTakipNo: ozelKargoTakipNo,
      Adet: 1,
      BirimDesi: 1,
      BirimKg: 1,
      KapidanOdemeTahsilatTipi: 1 as any,
      TasimaSekli: SuratTasimaSekli.KaraYolu,
      TeslimSekli: SuratTeslimSekli.AdreseTeslim,
      GonderiSekli: SuratGonderiSekli.Standart,
      Pazaryerimi: 0,
      Iademi: false,
    };
  }
}
