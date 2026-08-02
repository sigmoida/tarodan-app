import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import {
  ProductStatus,
  PaymentStatus,
  TradeStatus,
  ShipmentStatus,
} from "@prisma/client";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { PaymentService } from "../payment/payment.service";
import { EventService } from "../events/event.service";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";
import { AdminTradeCommonService } from "./admin-trade-common.service";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import { generateReferenceCode } from "../../common/helpers/generate-reference";

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
    private readonly suratCargoService?: SuratCargoService,
  ) {}

  /**
   * Resolve trade dispute or cancel trade
   */
  async resolveTrade(
    adminId: string,
    tradeId: string,
    dto: { resolution: string; note?: string },
  ) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException("Takas bulunamadı");
    }

    return this.prisma.$transaction(async (tx) => {
      // Get all trade items
      const allItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      const productIds = allItems.map((item) => item.productId);

      let updatedTrade;
      let newStatus: TradeStatus;

      if (dto.resolution === "cancel") {
        // Cancel trade - make products active again
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || "Admin tarafından iptal edildi",
          },
        });
      } else if (
        dto.resolution === "favor_initiator" ||
        dto.resolution === "complete_trade"
      ) {
        // Complete trade
        newStatus = TradeStatus.completed;

        // CRITICAL: When trade is completed, products should be marked as inactive
        // (not sold) so they disappear from listings
        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.inactive },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            completedAt: new Date(),
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else if (dto.resolution === "favor_receiver") {
        // Cancel and return products
        newStatus = TradeStatus.cancelled;

        await tx.product.updateMany({
          where: { id: { in: productIds } },
          data: { status: ProductStatus.active },
        });

        updatedTrade = await tx.trade.update({
          where: { id: tradeId },
          data: {
            status: newStatus,
            cancelledAt: new Date(),
            cancelReason: dto.note || "Alıcı lehine iptal edildi",
          },
        });

        // Update dispute if exists
        if (trade.dispute) {
          await tx.tradeDispute.update({
            where: { tradeId },
            data: {
              resolution: dto.resolution,
              resolvedById: adminId,
              resolvedAt: new Date(),
              resolutionNotes: dto.note,
            },
          });
        }
      } else {
        throw new BadRequestException(
          "Geçersiz çözüm tipi. Geçerli değerler: cancel, favor_initiator, favor_receiver, complete_trade",
        );
      }

      // Create audit log
      await this.audit.createAuditLog(
        adminId,
        "trade_resolve",
        "Trade",
        tradeId,
        trade,
        {
          ...updatedTrade,
          resolution: dto.resolution,
          note: dto.note,
        },
      );

      return {
        success: true,
        tradeId,
        resolution: dto.resolution,
        status: newStatus,
      };
    });
  }

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
          throw new NotFoundException("Takas bulunamadı");
        }

        const shipment = await tx.tradeShipment.findUnique({
          where: { id: shipmentId },
        });
        if (!shipment || shipment.tradeId !== tradeId) {
          throw new NotFoundException("Gönderim bulunamadı");
        }
        if (shipment.leg !== "return") {
          throw new BadRequestException("Bu gönderim bir iade gönderimi değil");
        }
        if (shipment.deliveredAt) {
          throw new BadRequestException(
            "Bu iade gönderimi zaten teslim edildi olarak işaretlenmiş",
          );
        }

        const now = new Date();
        const updatedShipment = await tx.tradeShipment.update({
          where: { id: shipmentId },
          data: {
            status: ShipmentStatus.delivered,
            deliveredAt: now,
            confirmedAt: now,
          },
        });

        // Check if all return shipments are delivered
        const returnShipments = await tx.tradeShipment.findMany({
          where: { tradeId, leg: "return" },
          select: { id: true, deliveredAt: true },
        });
        const allDelivered =
          returnShipments.length >= 2 &&
          returnShipments.every((s) => s.deliveredAt !== null);

        let finalStatus: TradeStatus = trade.status;
        if (allDelivered && trade.status !== TradeStatus.cancelled) {
          // Release reservations and reactivate products
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

          await tx.trade.update({
            where: { id: tradeId },
            data: {
              status: TradeStatus.cancelled,
              cancelledAt: now,
              updatedAt: now,
            },
          });
          finalStatus = TradeStatus.cancelled;
        }

        await this.audit.createAuditLog(
          adminId,
          "trade_return_delivered",
          "TradeShipment",
          shipmentId,
          shipment,
          {
            ...updatedShipment,
            allDelivered,
            tradeStatus: finalStatus,
          },
        );

        const parties = await tx.trade.findUnique({
          where: { id: tradeId },
          select: { initiatorId: true, receiverId: true },
        });

        return {
          success: true,
          tradeId,
          shipmentId,
          status: finalStatus,
          allDelivered,
          initiatorId: parties!.initiatorId,
          receiverId: parties!.receiverId,
        };
      })
      .then(async (res) => {
        if (res.allDelivered && res.status === TradeStatus.cancelled) {
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
        "İptal gerekçesi en az 10 karakter olmalıdır",
      );
    }
    const sendArrivedItemBack = dto.sendArrivedItemBack !== false;

    const txResult = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        include: { cashPayment: true },
      });
      if (!trade) {
        throw new NotFoundException("Takas bulunamadı");
      }
      if (trade.status !== TradeStatus.shipping_to_warehouse) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' force-cancel için uygun değil. Beklenen: shipping_to_warehouse.`,
        );
      }
      if (!trade.firstWarehouseArrivalAt) {
        throw new BadRequestException(
          "Hiçbir ürün depoya ulaşmamış; bu endpoint sadece kısmen ulaşmış takaslar için.",
        );
      }

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: "to_warehouse" },
      });
      const arrived = toWarehouseShipments.find((s) => s.deliveredAt !== null);
      const stuck = toWarehouseShipments.find((s) => s.deliveredAt === null);
      if (!arrived || !stuck) {
        throw new BadRequestException(
          "Hem ulaşmış hem de yolda olan bir kargo bulunamadı; force-cancel için durum uygun değil.",
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

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: returnShipmentDraft
            ? TradeStatus.returning
            : TradeStatus.cancelled,
          cancelReason: `Admin force-cancel (stuck): ${reason}`,
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
        shouldRefund:
          !!trade.cashPayment &&
          trade.cashPayment.status === PaymentStatus.completed,
        warehouseAddressId: returnShipmentDraft
          ? await this.common.resolveWarehouseAddressId(tx)
          : null,
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
      };
    });

    // Side effects outside the transaction:
    //   1) submit return shipment to Sürat (idempotent),
    //   2) cancel the stuck counterpart shipment at Sürat (best-effort),
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
        if (
          arrivedAddress &&
          this.suratCargoService &&
          this.suratCargoService.isIntegrationEnabled()
        ) {
          const result = await this.suratCargoService.createShipmentWithBarcode(
            {
              idempotencyKey: `surat:trade-stuck-return:${txResult.returnShipmentDraft.oid}`,
              correlationId: `trade-force-cancel-${tradeId}`,
              payload: buildStandardGonderiPayload({
                recipientName:
                  arrivedAddress.fullName ||
                  arrivedUser?.displayName ||
                  "Takas İade",
                address: arrivedAddress.address,
                city: arrivedAddress.city,
                district: arrivedAddress.district,
                phone: arrivedAddress.phone,
                ref: txResult.returnShipmentDraft.oid,
                content: "Takas Kayıp İade",
                isReturn: true,
                // KisiKurum fallback zinciri "Takas İade" (builder'ın "Alıcı"sı
                // değil) ve trim yok → birebir korumak için override.
                overrides: {
                  KisiKurum:
                    arrivedAddress.fullName ||
                    arrivedUser?.displayName ||
                    "Takas İade",
                },
              }),
            },
          );
          if (result.ok) {
            await this.prisma.tradeShipment.update({
              where: { id: txResult.returnShipmentDraft.id },
              data: {
                carrier: "surat",
                trackingNumber: txResult.returnShipmentDraft.oid,
                providerTrackingId: result.kargoTakipNo,
                labelZpl: result.labelZpl,
                status: ShipmentStatus.label_created,
                shippedAt: new Date(),
              },
            });
          } else {
            const r = result as any;
            const errMsg =
              r.kind === "business" ? r.suratMessage : `technical: ${r.code}`;
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

    // Cancel the stuck counterpart shipment in Sürat (best-effort).
    if (
      txResult.stuckShipment.carrier === "surat" &&
      txResult.stuckShipment.trackingNumber &&
      this.suratCargoService &&
      this.suratCargoService.isIntegrationEnabled()
    ) {
      try {
        await this.suratCargoService.cancelShipmentByOrderNumber(
          txResult.stuckShipment.trackingNumber,
        );
        await this.prisma.tradeShipment.update({
          where: { id: txResult.stuckShipment.id },
          data: { status: "cancelled" as any },
        });
      } catch (err: any) {
        this.logger.error(
          `Force-cancel stuck-shipment Sürat cancel failed trade=${tradeId}: ${err?.message}`,
        );
      }
    }

    if (txResult.shouldRefund) {
      try {
        await this.paymentService.refundTradeCashPaymentIfCompleted(tradeId);
        await this.prisma.trade.update({
          where: { id: tradeId },
          data: { refundFailureReason: null, refundFailureAt: null },
        });
      } catch (err: any) {
        const message =
          err?.message ?? "Bilinmeyen hata (PayTR iade başarısız)";
        this.logger.error(
          `forceCancelStuckWarehouseTrade refund failed for ${tradeId}: ${message}`,
        );
        try {
          await this.prisma.trade.update({
            where: { id: tradeId },
            data: {
              refundFailureReason: message.slice(0, 500),
              refundFailureAt: new Date(),
            },
          });
        } catch (persistErr: any) {
          this.logger.error(
            `Failed to persist refund failure (force-cancel) trade=${tradeId}: ${persistErr?.message}`,
          );
        }
      }
    }

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
        "Kayıp gerekçesi en az 10 karakter olmalıdır",
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
          throw new NotFoundException("Takas bulunamadı");
        }

        const shipment = await tx.tradeShipment.findUnique({
          where: { id: dto.shipmentId },
        });
        if (!shipment || shipment.tradeId !== tradeId) {
          throw new NotFoundException("Gönderim bulunamadı");
        }
        if (shipment.leg !== "return") {
          throw new BadRequestException(
            "Sadece iade gönderileri kayıp olarak işaretlenebilir",
          );
        }
        if (shipment.deliveredAt) {
          throw new BadRequestException(
            "Bu gönderim zaten teslim edildi; kayıp işaretlenemez",
          );
        }
        if (shipment.lostAt) {
          throw new BadRequestException("Bu gönderim zaten kayıp işaretli");
        }

        const compensationUserId =
          dto.compensateUserId ?? shipment.recipientUserId ?? null;
        if (
          compensationUserId &&
          compensationUserId !== trade.initiatorId &&
          compensationUserId !== trade.receiverId
        ) {
          throw new BadRequestException(
            "Tazminat kullanıcısı bu takasın taraflarından biri olmalı",
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

        // If every return shipment has been resolved (delivered or lost),
        // finalize the trade the same way markReturnDelivered would: release
        // reservations, reactivate products, and cancel the trade.
        const returnShipments = await tx.tradeShipment.findMany({
          where: { tradeId, leg: "return" },
          select: { id: true, deliveredAt: true, lostAt: true },
        });
        const allResolved =
          returnShipments.length >= 2 &&
          returnShipments.every(
            (s) => s.deliveredAt !== null || s.lostAt !== null,
          );

        let finalStatus: TradeStatus = trade.status;
        if (allResolved && trade.status !== TradeStatus.cancelled) {
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

          await tx.trade.update({
            where: { id: tradeId },
            data: {
              status: TradeStatus.cancelled,
              cancelledAt: now,
              updatedAt: now,
              ...(compensationUserId
                ? {
                    compensationPendingUserId: compensationUserId,
                    compensationResolvedAt: null,
                  }
                : {}),
            },
          });
          finalStatus = TradeStatus.cancelled;
        } else if (compensationUserId) {
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
