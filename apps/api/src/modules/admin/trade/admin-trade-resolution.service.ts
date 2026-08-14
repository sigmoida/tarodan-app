import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { ProductStatus, TradeStatus, ShipmentStatus } from "@prisma/client";
import { safeDecrementReserved } from "../../product/helpers/product-availability.helper";
import { getProductStatusFromQuantity } from "../../product/helpers/product-status.helper";
import { PaymentService } from "../../payment/payment.service";
import { EventService } from "../../events/event.service";
import {
  CARGO_PROVIDER,
  type CargoProvider,
} from "../../surat-cargo/cargo-provider";
import { AdminTradeCommonService } from "./admin-trade-common.service";
import { REFERENCE_PREFIX } from "../../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../../common/helpers/generate-reference";
import { CarrierCancellationService } from "../../surat-cargo/carrier-cancellation.service";
import { TRADE_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";
import { finalizeReturningTradeIfResolved } from "../../../common/helpers/trade-return-finalize";
import { i18nMessage } from "../../i18n";

/**
 * Takas çözüm & iade/iptal yaşam döngüsü (resolveTrade, markReturnDelivered,
 * forceCancelStuckWarehouseTrade, markReturnShipmentLost) — AdminTradeService
 * buraya delege eder. Paylaşılan depo adresi çözümü AdminTradeCommonService'te.
 */
@Injectable()
export class AdminTradeResolutionService {
  private readonly logger = new Logger(AdminTradeResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly eventService: EventService,
    private readonly common: AdminTradeCommonService,
    @Optional()
    @Inject(CARGO_PROVIDER)
    private readonly cargo?: CargoProvider,
    @Optional()
    private readonly carrierCancellations?: CarrierCancellationService,
  ) {}

  // NOT: Eski `resolveTrade` (cancel / favor_initiator / favor_receiver /
  // complete_trade) KALDIRILDI: hiçbir iade çağırmadan iptal ediyor,
  // reservedQuantity düşmeden ürünleri aktifliyor ve durum makinesi
  // tanımıyordu; hiçbir istemci de kullanmıyordu. İtiraz çözümü
  // TradeLifecycleService.resolveDispute'ta, takılı takas
  // forceCancelStuckWarehouseTrade'de, depo reddi AdminTradeWarehouseService'te.

  /**
   * Admin marks a return shipment as delivered back to its original owner.
   * When both return shipments are delivered, release any product
   * reservations, re-activate the products, and cancel the trade.
   */
  async markReturnDelivered(
    adminId: string,
    tradeId: string,
    shipmentId: string,
  ) {
    return this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

        const trade = await tx.trade.findUnique({
          where: { id: tradeId },
          select: { id: true, status: true },
        });
        if (!trade) {
          throw new NotFoundException(i18nMessage("server.trade.notFound"));
        }

        const shipment = await tx.tradeShipment.findUnique({
          where: { id: shipmentId },
        });
        if (!shipment || shipment.tradeId !== tradeId) {
          throw new NotFoundException(
            i18nMessage("server.admin.trade.shipmentNotFound"),
          );
        }
        if (shipment.leg !== "return") {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.notReturnShipment"),
          );
        }

        const now = new Date();
        // Zaten teslim edilmiş bacakta hata FIRLATMAK, poll'un teslimi yazıp
        // finalizasyonda takıldığı takası admin'in de kurtaramamasına yol
        // açıyordu: tarihi ötelemeden yalnız kapanışı onar (mark-outbound-
        // delivered ile aynı onarım semantiği).
        const updatedShipment = shipment.deliveredAt
          ? shipment
          : await tx.tradeShipment.update({
              where: { id: shipmentId },
              data: {
                status: ShipmentStatus.delivered,
                deliveredAt: now,
                confirmedAt: now,
              },
            });

        // Kapanış şartı ve kapanışın kendisi tek kaynaktan: teslim YA DA kayıp
        // çözülmüş sayılır — yalnız teslimleri saymak, "önce kayıp sonra
        // teslim" sıralamasında takası sonsuza dek returning'de bırakıyordu.
        const finalize = await finalizeReturningTradeIfResolved(
          tx,
          tradeId,
          now,
        );
        const finalStatus: TradeStatus = finalize.finalized
          ? TradeStatus.cancelled
          : trade.status;

        await this.audit.createAuditLog(
          adminId,
          "trade_return_delivered",
          "TradeShipment",
          shipmentId,
          shipment,
          {
            ...updatedShipment,
            allDelivered: finalize.allResolved,
            tradeStatus: finalStatus,
          },
        );

        return {
          success: true,
          tradeId,
          shipmentId,
          status: finalStatus,
          allDelivered: finalize.allResolved,
          // Bildirim yalnız kapanışın GERÇEKLEŞTİĞİ çağrıda gitsin — zaten
          // cancelled bir takasta onarım no-op'u yeniden duyuru üretmesin.
          finalized: finalize.finalized,
          initiatorId: finalize.initiatorId ?? "",
          receiverId: finalize.receiverId ?? "",
        };
      })
      .then(async (res) => {
        if (res.finalized) {
          try {
            await this.eventService.emitTradeReturnCompleted({
              tradeId: res.tradeId,
              initiatorId: res.initiatorId,
              receiverId: res.receiverId,
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit trade.return-completed for trade ${res.tradeId}: ${err}`,
            );
          }
        }
        return {
          success: res.success,
          tradeId: res.tradeId,
          shipmentId: res.shipmentId,
          status: res.status,
          allDelivered: res.allDelivered,
        };
      });
  }

  /**
   * Admin unblocks a `shipping_to_warehouse` trade where one item arrived at
   * the warehouse but the counterpart shipment is stuck in transit. Cancels
   * the stuck counterpart in the carrier, optionally opens a return for the
   * arrived item, transitions the trade to `returning`, and refunds any
   * completed cash payment. Stock reservations release when the return is
   * marked delivered (or immediately if no return shipment is created).
   */
  async forceCancelStuckWarehouseTrade(
    adminId: string,
    tradeId: string,
    dto: { reason: string; sendArrivedItemBack?: boolean },
  ) {
    const reason = dto?.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        i18nMessage("server.admin.trade.cancelReasonTooShort"),
      );
    }
    const sendArrivedItemBack = dto.sendArrivedItemBack !== false;

    const txResult = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: { cashPayments: true },
      });
      if (!trade) {
        throw new NotFoundException(i18nMessage("server.trade.notFound"));
      }
      if (trade.status !== TradeStatus.shipping_to_warehouse) {
        throw new BadRequestException(
          i18nMessage("server.admin.trade.forceCancelTradeStateInvalid", {
            status: trade.status,
          }),
        );
      }
      if (!trade.firstWarehouseArrivalAt) {
        throw new BadRequestException(
          i18nMessage("server.admin.trade.nothingArrived"),
        );
      }

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: "to_warehouse" },
      });
      const arrived = toWarehouseShipments.find((s) => s.deliveredAt !== null);
      const stuck = toWarehouseShipments.find((s) => s.deliveredAt === null);
      if (!arrived || !stuck) {
        throw new BadRequestException(
          i18nMessage("server.admin.trade.forceCancelStateInvalid"),
        );
      }

      const now = new Date();
      let returnShipmentDraft: {
        id: string;
        recipientUserId: string;
        oid: string;
      } | null = null;

      if (sendArrivedItemBack && arrived.recipientUserId === null) {
        // recipientUserId on arrived to_warehouse is the shipper (the original owner).
      }
      if (sendArrivedItemBack) {
        const arrivedOwnerId = arrived.shipperId;
        const warehouseAddressId =
          await this.common.resolveWarehouseAddressId(tx);
        const oid = `${trade.tradeNumber}-RET-STK`
          .replace(/[^a-zA-Z0-9-]/g, "")
          .slice(0, 50);
        const draft = await tx.tradeShipment.create({
          data: {
            tradeId,
            shipperId: adminId,
            fromAddressId: warehouseAddressId,
            carrier: "pending",
            trackingNumber: null,
            status: ShipmentStatus.pending,
            leg: "return",
            recipientType: "user",
            recipientUserId: arrivedOwnerId,
          },
        });
        returnShipmentDraft = {
          id: draft.id,
          recipientUserId: arrivedOwnerId,
          oid,
        };
      }

      // KUSUR: kolisini kargoya vermiş taraflar üstüne düşeni yapmıştır →
      // ödemeleri hizmet bedeli ve kargo dahil TAM iade edilir. Karşı taraf
      // kolisini hiç vermediyse standart matrise tabidir; o da vermiş ama
      // kargoda takılmışsa iki taraf da kusursuzdur (taşıyıcı kaynaklı).
      const faultlessShipperIds = [
        ...new Set(
          toWarehouseShipments
            .filter((s) => s.shippedAt !== null || s.deliveredAt !== null)
            .map((s) => s.shipperId),
        ),
      ];
      if (faultlessShipperIds.length > 0) {
        await tx.tradeCashPayment.updateMany({
          where: { tradeId, payerId: { in: faultlessShipperIds } },
          data: { fullRefundEntitled: true },
        });
      }

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: returnShipmentDraft
            ? TradeStatus.returning
            : TradeStatus.cancelled,
          cancelReason: TRADE_CANCEL_REASON.adminForceCancelStuck(reason),
          ...(returnShipmentDraft ? {} : { cancelledAt: now }),
          updatedAt: now,
        },
      });

      // Stock release happens on markReturnDelivered (or immediately when no
      // return shipment is created — the items are already with their owners).
      if (!returnShipmentDraft) {
        const items = await tx.tradeItem.findMany({
          where: { tradeId },
          select: { productId: true, quantity: true },
        });
        const byProduct = new Map<string, number>();
        for (const item of items) {
          byProduct.set(
            item.productId,
            (byProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
        for (const [productId, qty] of byProduct) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(
              prod.reservedQuantity,
              qty,
            );
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0
                    ? ProductStatus.reserved
                    : ProductStatus.active,
              },
            });
          }
        }
      }

      await this.audit.createAuditLog(
        adminId,
        "trade_force_cancel_stuck",
        "Trade",
        tradeId,
        trade,
        {
          reason,
          stuckShipmentId: stuck.id,
          arrivedShipmentId: arrived.id,
          returnShipmentId: returnShipmentDraft?.id ?? null,
          newStatus: returnShipmentDraft ? "returning" : "cancelled",
        },
      );

      return {
        arrivedOwnerId: arrived.shipperId,
        stuckShipment: {
          id: stuck.id,
          trackingNumber: stuck.trackingNumber,
          carrier: stuck.carrier,
        },
        returnShipmentDraft,
        warehouseAddressId: returnShipmentDraft
          ? await this.common.resolveWarehouseAddressId(tx)
          : null,
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
      };
    });

    // Side effects outside the transaction:
    //   1) submit return shipment to Sürat (idempotent),
    //   2) cancel the stuck counterpart shipment locally (best-effort; carrier panel is manual),
    //   3) trigger refund.

    if (txResult.returnShipmentDraft) {
      try {
        const arrivedUser = await this.prisma.user.findUnique({
          where: { id: txResult.arrivedOwnerId },
        });
        const arrivedAddress = await this.prisma.address.findFirst({
          where: { userId: txResult.arrivedOwnerId },
          orderBy: { isDefault: "desc" },
        });
        if (arrivedAddress && this.cargo && this.cargo.isEnabled()) {
          const result = await this.cargo.createShipment({
            idempotencyKey: `surat:trade-stuck-return:${txResult.returnShipmentDraft.oid}`,
            correlationId: `trade-force-cancel-${tradeId}`,
            reference: txResult.returnShipmentDraft.oid,
            recipient: {
              name:
                arrivedAddress.fullName ||
                arrivedUser?.displayName ||
                "Takas İade",
              address: arrivedAddress.address,
              city: arrivedAddress.city,
              district: arrivedAddress.district,
              phone: arrivedAddress.phone,
            },
            content: "Takas Kayıp İade",
            isReturn: true,
          });
          if (result.ok) {
            await this.prisma.tradeShipment.update({
              where: { id: txResult.returnShipmentDraft.id },
              data: {
                carrier: "surat",
                trackingNumber: txResult.returnShipmentDraft.oid,
                providerTrackingId: result.trackingCode,
                labelZpl: result.labelData,
                status: ShipmentStatus.label_created,
                shippedAt: new Date(),
              },
            });
          } else {
            const r = result as any;
            const errMsg =
              r.kind === "business" ? r.message : `technical: ${r.code}`;
            this.logger.error(
              `Force-cancel return shipment submit failed for trade ${tradeId}: ${errMsg}`,
            );
          }
        } else {
          await this.prisma.tradeShipment.update({
            where: { id: txResult.returnShipmentDraft.id },
            data: {
              carrier: "Tarodan Warehouse",
              trackingNumber: generateReferenceCode(
                REFERENCE_PREFIX.shipmentFallback,
              ),
              status: ShipmentStatus.label_created,
              shippedAt: new Date(),
            },
          });
        }
      } catch (err: any) {
        this.logger.error(
          `Force-cancel return submit unexpected error trade=${tradeId}: ${err?.message}`,
        );
      }
    }

    // Resmi API'de uzak iptal yok: karşı bacağı yerelde iptal et; fiziksel işlem
    // gerekiyorsa operasyon ekibi Sürat panelinden tamamlar.
    if (
      txResult.stuckShipment.carrier === "surat" &&
      txResult.stuckShipment.trackingNumber &&
      this.cargo &&
      this.cargo.isEnabled() &&
      this.carrierCancellations
    ) {
      try {
        await this.carrierCancellations.request({
          provider: "surat",
          reference: txResult.stuckShipment.trackingNumber,
          entityType: "trade_shipment",
          entityId: txResult.stuckShipment.id,
          reason: "admin_force_cancel_stuck_trade",
          metadata: { tradeId },
          updateLocal: async (tx) => {
            await tx.tradeShipment.update({
              where: { id: txResult.stuckShipment.id },
              data: { status: "cancelled" as any },
            });
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Force-cancel stuck-shipment local cancel failed trade=${tradeId}: ${err?.message}`,
        );
      }
    }

    // MONEY: iade HER ZAMAN failure-tracking'li yoldan denenir; ödemesiz
    // takasta no-op. Eski kod yalnız primaryCashPayment satırına bakıyordu —
    // v2'de asıl ödeyen DİĞER taraf olduğunda iade hiç denenmiyor, marker da
    // yazılmadığı için retry cron'u göremiyordu.
    await this.paymentService.refundTradeCashTracked(tradeId);

    return {
      success: true,
      tradeId,
      status: txResult.returnShipmentDraft
        ? TradeStatus.returning
        : TradeStatus.cancelled,
      arrivedOwnerId: txResult.arrivedOwnerId,
      returnShipmentId: txResult.returnShipmentDraft?.id ?? null,
    };
  }

  /**
   * Admin declares a return shipment as lost in transit. Mirrors the
   * markReturnDelivered finalization (stock release + trade cancel) but
   * additionally flags `compensationPendingUserId` on the trade so ops can
   * settle the affected user manually.
   */
  async markReturnShipmentLost(
    adminId: string,
    tradeId: string,
    dto: { shipmentId: string; reason: string; compensateUserId?: string },
  ) {
    const reason = dto?.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        i18nMessage("server.admin.trade.lostReasonTooShort"),
      );
    }

    return this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

        const trade = await tx.trade.findUnique({
          where: { id: tradeId },
          select: {
            id: true,
            status: true,
            initiatorId: true,
            receiverId: true,
            compensationPendingUserId: true,
          },
        });
        if (!trade) {
          throw new NotFoundException(i18nMessage("server.trade.notFound"));
        }

        const shipment = await tx.tradeShipment.findUnique({
          where: { id: dto.shipmentId },
        });
        if (!shipment || shipment.tradeId !== tradeId) {
          throw new NotFoundException(
            i18nMessage("server.admin.trade.shipmentNotFound"),
          );
        }
        if (shipment.leg !== "return") {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.lostReturnOnly"),
          );
        }
        if (shipment.deliveredAt) {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.deliveredNotLost"),
          );
        }
        if (shipment.lostAt) {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.alreadyLost"),
          );
        }

        const compensationUserId =
          dto.compensateUserId ?? shipment.recipientUserId ?? null;
        if (
          compensationUserId &&
          compensationUserId !== trade.initiatorId &&
          compensationUserId !== trade.receiverId
        ) {
          throw new BadRequestException(
            i18nMessage("server.admin.trade.compensationUserNotParty"),
          );
        }

        const now = new Date();
        const updatedShipment = await tx.tradeShipment.update({
          where: { id: dto.shipmentId },
          data: {
            status: ShipmentStatus.failed,
            lostAt: now,
            lostReason: reason,
          },
        });

        // Kapanış tek kaynaktan (markReturnDelivered ve Sürat poll'u ile aynı
        // çekirdek): tüm iade bacakları çözüldüyse rezervasyonları çözer, kayıp
        // bacaktaki ürünleri stoktan düşer ve takası cancelled yapar.
        const finalize = await finalizeReturningTradeIfResolved(
          tx,
          tradeId,
          now,
        );
        const allResolved = finalize.allResolved;
        const finalStatus: TradeStatus = finalize.finalized
          ? TradeStatus.cancelled
          : trade.status;

        if (compensationUserId) {
          await tx.trade.update({
            where: { id: tradeId },
            data: {
              compensationPendingUserId: compensationUserId,
              compensationResolvedAt: null,
              updatedAt: now,
            },
          });
        }

        await this.audit.createAuditLog(
          adminId,
          "trade_return_shipment_lost",
          "TradeShipment",
          dto.shipmentId,
          shipment,
          {
            ...updatedShipment,
            allResolved,
            tradeStatus: finalStatus,
            compensationUserId,
            reason,
          },
        );

        return {
          success: true,
          tradeId,
          shipmentId: dto.shipmentId,
          status: finalStatus,
          compensationUserId,
          reason,
        };
      })
      .then(async (res) => {
        try {
          await this.eventService.emitTradeReturnLost({
            tradeId: res.tradeId,
            compensationUserId: res.compensationUserId,
            reason: res.reason,
          });
        } catch (err) {
          this.logger.error(
            `Failed to emit trade.return-lost for trade ${res.tradeId}: ${err}`,
          );
        }
        return {
          success: res.success,
          tradeId: res.tradeId,
          shipmentId: res.shipmentId,
          status: res.status,
          compensationUserId: res.compensationUserId,
        };
      });
  }
}
