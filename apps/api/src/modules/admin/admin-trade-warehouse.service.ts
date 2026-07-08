import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import {
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
} from './dto';
import { PaymentStatus, TradeStatus, ShipmentStatus } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { EventService } from '../events/event.service';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { normalizeSuratPhone, normalizeSuratLocation } from '../surat-cargo/surat-address.util';
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
} from '../surat-cargo/surat-cargo.types';
import { AdminTradeCommonService } from './admin-trade-common.service';

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
    private readonly common: AdminTradeCommonService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
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
      const chosen = await tx.address.findFirst({ where: { id: chosenId, userId } });
      if (chosen) return chosen;
    }
    return tx.address.findFirst({
      where: { userId },
      orderBy: { isDefault: 'desc' },
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
  ): Promise<{ carrier: string; trackingNumber: string }> {
    if (!this.suratCargoService || !this.suratCargoService.isIntegrationEnabled()) {
      const fallbackTracking = `TRK${Date.now().toString(36).toUpperCase()}${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;
      return { carrier: 'Tarodan Warehouse', trackingNumber: fallbackTracking };
    }
    const result = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: `surat:trade-return:${oid}`,
      correlationId: `trade-reject-${tradeId}`,
      payload: {
        KisiKurum: address.fullName || user?.displayName || 'Takas İade',
        SahisBirim: 'Takas İade Gönderisi',
        AliciAdresi: address.address,
        Il: normalizeSuratLocation(address.city),
        Ilce: normalizeSuratLocation(address.district),
        TelefonCep: normalizeSuratPhone(address.phone),
        KargoTuru: SuratKargoTuru.Koli,
        OdemeTipi: SuratOdemeTipi.Pesin,
        OzelKargoTakipNo: oid,
        Adet: 1,
        BirimDesi: 1,
        BirimKg: 1,
        KapidanOdemeTahsilatTipi: 1,
        TasimaSekli: SuratTasimaSekli.KaraYolu,
        TeslimSekli: SuratTeslimSekli.AdreseTeslim,
        GonderiSekli: SuratGonderiSekli.Standart,
        Pazaryerimi: 0,
        Iademi: true,
      },
    });
    if (!result.ok) {
      const r = result as any;
      const errMsg = r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
      throw new BadRequestException(`Sürat iade kargo siparişi reddedildi: ${errMsg}`);
    }
    return { carrier: 'surat', trackingNumber: oid };
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
    return this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException('Takas bulunamadı');
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException('Gönderim bulunamadı');
      }
      if (shipment.leg !== 'to_warehouse') {
        throw new BadRequestException(
          'Bu gönderim depoya gelen bir gönderim değil',
        );
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu gönderim zaten teslim alındı olarak işaretlenmiş',
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
        where: { tradeId, leg: 'to_warehouse' },
        select: { id: true, deliveredAt: true },
      });
      const bothDelivered =
        toWarehouseShipments.length >= 2 &&
        toWarehouseShipments.every((s) => s.deliveredAt !== null);

      // Lock user-side cancel on the first warehouse arrival. From this point
      // on, only admin can unwind the trade (reject or force-cancel-stuck).
      const isFirstArrival = trade.firstWarehouseArrivalAt === null;

      let nextStatus: TradeStatus = trade.status;
      if (bothDelivered && trade.status !== TradeStatus.at_warehouse) {
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
        'trade_warehouse_received',
        'TradeShipment',
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
    }).then(async (res) => {
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
      return res;
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
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: {
          items: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
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
        this.pickTradeSideAddress(tx, trade.initiatorAddressId, trade.initiatorId),
        this.pickTradeSideAddress(tx, trade.receiverAddressId, trade.receiverId),
      ]);

      if (!initiatorAddress) {
        throw new BadRequestException(
          'Takası başlatan kullanıcının kayıtlı adresi yok',
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          'Takası alan kullanıcının kayıtlı adresi yok',
        );
      }

      const warehouseAddressId = await this.common.resolveWarehouseAddressId(tx);

      const genTrackingNumber = () =>
        `TRK${Date.now().toString(36).toUpperCase()}${Math.random()
          .toString(36)
          .substring(2, 6)
          .toUpperCase()}`;

      const now = new Date();

      // Submit each warehouse-to-recipient leg to Sürat as a real shipment.
      // If integration is disabled, falls back to internal tracking number.
      const initiatorOid = `TRD-${trade.tradeNumber}-INI`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);
      const receiverOid = `TRD-${trade.tradeNumber}-REC`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);

      const initiatorUser = await tx.user.findUnique({ where: { id: trade.initiatorId } });
      const receiverUser = await tx.user.findUnique({ where: { id: trade.receiverId } });

      const submitToSurat = async (oid: string, addr: any, user: any): Promise<{ carrier: string; trackingNumber: string }> => {
        if (!this.suratCargoService || !this.suratCargoService.isIntegrationEnabled()) {
          return { carrier: 'Tarodan Warehouse', trackingNumber: genTrackingNumber() };
        }
        try {
          const result = await this.suratCargoService.submitShipmentWithRetry({
            idempotencyKey: `surat:trade:${oid}`,
            correlationId: `trade-approve-${tradeId}`,
            payload: {
              KisiKurum: addr.fullName || user?.displayName || 'Takas Alıcısı',
              SahisBirim: 'Takas Gönderisi',
              AliciAdresi: addr.address,
              Il: normalizeSuratLocation(addr.city),
              Ilce: normalizeSuratLocation(addr.district),
              TelefonCep: normalizeSuratPhone(addr.phone),
              KargoTuru: SuratKargoTuru.Koli,
              OdemeTipi: SuratOdemeTipi.Pesin,
              OzelKargoTakipNo: oid,
              Adet: 1,
              BirimDesi: 1,
              BirimKg: 1,
              KapidanOdemeTahsilatTipi: 1,
              TasimaSekli: SuratTasimaSekli.KaraYolu,
              TeslimSekli: SuratTeslimSekli.AdreseTeslim,
              GonderiSekli: SuratGonderiSekli.Standart,
              Pazaryerimi: 0,
              Iademi: false,
            },
          });
          if (!result.ok) {
            const r = result as any;
            const errMsg = r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
            throw new BadRequestException(
              `Sürat kargo onay siparişi reddedildi: ${errMsg}`,
            );
          }
          return { carrier: 'surat', trackingNumber: oid };
        } catch (error: any) {
          this.logger.error(`Surat shipment submit failed for trade ${tradeId}: ${error.message}`);
          throw error;
        }
      };

      const initiatorShipResult = await submitToSurat(initiatorOid, initiatorAddress, initiatorUser);
      const receiverShipResult = await submitToSurat(receiverOid, receiverAddress, receiverUser);

      // Shipment heading to the initiator (carrying receiver's items)
      const shipmentToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: initiatorShipResult.carrier,
          trackingNumber: initiatorShipResult.trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: now,
          leg: 'from_warehouse',
          recipientType: 'user',
          recipientUserId: trade.initiatorId,
        },
      });

      // Shipment heading to the receiver (carrying initiator's items)
      const shipmentToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: receiverShipResult.carrier,
          trackingNumber: receiverShipResult.trackingNumber,
          status: ShipmentStatus.label_created,
          shippedAt: now,
          leg: 'from_warehouse',
          recipientType: 'user',
          recipientUserId: trade.receiverId,
        },
      });

      // Y12: Safe-trade depodan-çıkış sevkinde confirmationDeadline SET ET. Eskiden
      // set edilmediği için autoConfirmExpiredReceipts (confirmationDeadline < now filtresi)
      // safe-trade'lerde hiç eşleşmiyordu → alıcı onaylamazsa para shipping_to_recipients'te
      // süresiz askıda kalıyordu. Direct akıştaki (both_shipped) ile aynı setting kullanılır.
      const confirmationDaysSetting = await tx.platformSetting.findUnique({
        where: { settingKey: 'trade_confirmation_deadline_days' },
      });
      const confirmationDays = parseInt(confirmationDaysSetting?.settingValue ?? '3');
      const confirmationDeadline = new Date(now);
      confirmationDeadline.setDate(confirmationDeadline.getDate() + confirmationDays);

      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.shipping_to_recipients,
          confirmationDeadline,
          updatedAt: now,
        },
      });

      await this.audit.createAuditLog(
        adminId,
        'trade_warehouse_approve',
        'Trade',
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
      };
    });

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
      throw new BadRequestException('Red nedeni zorunludur');
    }

    // Idempotency: if the trade is already `returning` from a prior reject,
    // return the existing result instead of re-running Sürat / refund.
    const existing = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true,
        status: true,
        refundFailureReason: true,
        shipments: { where: { leg: 'return' }, select: { id: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Takas bulunamadı');
    }
    if (existing.status === TradeStatus.returning && existing.shipments.length >= 2) {
      return {
        success: true,
        tradeId,
        status: existing.status,
        refundFailure: existing.refundFailureReason,
        idempotent: true,
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
          cashPayment: true,
        },
      });
      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
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
        this.pickTradeSideAddress(tx, trade.initiatorAddressId, trade.initiatorId),
        this.pickTradeSideAddress(tx, trade.receiverAddressId, trade.receiverId),
      ]);
      if (!initiatorAddress) {
        throw new BadRequestException(
          'Takası başlatan kullanıcının kayıtlı adresi yok',
        );
      }
      if (!receiverAddress) {
        throw new BadRequestException(
          'Takası alan kullanıcının kayıtlı adresi yok',
        );
      }

      const warehouseAddressId = await this.common.resolveWarehouseAddressId(tx);
      const now = new Date();

      const initiatorReturnOid = `TRD-${trade.tradeNumber}-RET-INI`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);
      const receiverReturnOid = `TRD-${trade.tradeNumber}-RET-REC`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 50);

      // DRAFT rows — carrier/trackingNumber set after the Sürat call returns.
      const returnToInitiator = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: 'pending',
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: 'return',
          recipientType: 'user',
          recipientUserId: trade.initiatorId,
        },
      });
      const returnToReceiver = await tx.tradeShipment.create({
        data: {
          tradeId,
          shipperId: adminId,
          fromAddressId: warehouseAddressId,
          carrier: 'pending',
          trackingNumber: null,
          status: ShipmentStatus.pending,
          leg: 'return',
          recipientType: 'user',
          recipientUserId: trade.receiverId,
        },
      });

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
        'trade_warehouse_reject',
        'Trade',
        tradeId,
        trade,
        {
          ...updatedTrade,
          reason: dto.reason,
          returnShipments: [returnToInitiator.id, returnToReceiver.id],
        },
      );

      const shouldRefund =
        !!trade.cashPayment &&
        trade.cashPayment.status === PaymentStatus.completed;

      return {
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        status: updatedTrade.status,
        shouldRefund,
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
    let refundFailureMessage: string | null = null;
    if (result.shouldRefund) {
      try {
        await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        });
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findUnique({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundCompleted({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-completed for trade ${tradeId}: ${emitErr}`,
          );
        }
      } catch (err: any) {
        refundFailureMessage =
          err?.message ?? 'Bilinmeyen hata (PayTR iade başarısız)';
        this.logger.error(
          `refundTradeCashPaymentIfCompleted failed for trade ${tradeId}: ${refundFailureMessage}`,
        );
        try {
          await this.prisma.trade.update({
            where: { id: tradeId },
            data: {
              refundFailureReason: refundFailureMessage.slice(0, 500),
              refundFailureAt: new Date(),
            },
          });
        } catch (persistErr: any) {
          this.logger.error(
            `Failed to persist refund failure for trade ${tradeId}: ${persistErr?.message}`,
          );
        }
        try {
          const cashPayment = await this.prisma.tradeCashPayment.findUnique({
            where: { tradeId },
            select: { payerId: true },
          });
          await this.eventService.emitTradeRefundFailed({
            tradeId,
            cashPayerId: cashPayment?.payerId ?? null,
            reason: refundFailureMessage,
          });
        } catch (emitErr) {
          this.logger.error(
            `Failed to emit trade.refund-failed for trade ${tradeId}: ${emitErr}`,
          );
        }
      }
    }

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
