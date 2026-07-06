import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { AdminAuditService } from './admin-audit.service';
import {
  ApproveWarehouseTradeDto,
  RejectWarehouseTradeDto,
} from './dto';
import { ProductStatus, Prisma, PaymentStatus, TradeStatus, ShipmentStatus } from '@prisma/client';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
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

/**
 * Takas yönetimi (admin liste/detay, resolveTrade, depo teslim alma /
 * onay / red, iade teslim/kayıp, stuck force-cancel) — AdminService'in
 * TRADE MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminTradeService {
  private readonly logger = new Logger(AdminTradeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly paymentService: PaymentService,
    private readonly eventService: EventService,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if ((imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://')) && imageKeyOrUrl.includes('X-Amz-Signature')) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = '';
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== TRADE MANAGEMENT ====================

  /**
   * Get trades with filters for admin
   */
  async getTrades(query: {
    status?: TradeStatus;
    initiatorId?: string;
    receiverId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, initiatorId, receiverId, userId, fromDate, toDate, search, page = 1, limit = 20 } = query;

    const where: Prisma.TradeWhereInput = {};

    if (status) {
      where.status = status;
    }

    // AND koşulları: userId/initiatorId/receiverId filtresi ile search çakışmasın
    const and: Prisma.TradeWhereInput[] = [];

    if (userId) {
      // Kullanıcıya ait tüm takaslar (başlatan VEYA alan)
      and.push({ OR: [{ initiatorId: userId }, { receiverId: userId }] });
    } else {
      // Tekil id filtresi: AND içinde ayrı ayrı koy
      if (initiatorId) and.push({ initiatorId });
      if (receiverId) and.push({ receiverId });
    }

    if (search) {
      // Takas no, başlatan displayName/email veya alıcı displayName/email araması
      and.push({
        OR: [
          { tradeNumber: { contains: search, mode: 'insensitive' } },
          { initiator: { displayName: { contains: search, mode: 'insensitive' } } },
          { receiver:  { displayName: { contains: search, mode: 'insensitive' } } },
          { initiator: { email: { contains: search, mode: 'insensitive' } } },
          { receiver:  { email: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (and.length) {
      where.AND = and;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.createdAt.lte = new Date(toDate);
      }
    }

    const [total, trades] = await Promise.all([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        include: {
          initiator: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  images: { take: 1, orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
          shipments: true,
          cashPayment: true,
          dispute: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: trades,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List ALL TradeShipments across trades with status / leg / tradeNumber filters.
   * Joins shipper and (when present) recipient users by user id since
   * TradeShipment does not have direct relations to User.
   */
  async findTradeShipments(query: {
    status?: ShipmentStatus;
    leg?: 'to_warehouse' | 'from_warehouse' | 'return';
    tradeNumber?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, leg, tradeNumber, page = 1, limit = 20 } = query;

    const where: Prisma.TradeShipmentWhereInput = {
      ...(status && { status }),
      ...(leg && { leg }),
      ...(tradeNumber && {
        trade: {
          tradeNumber: { contains: tradeNumber, mode: 'insensitive' },
        },
      }),
    };

    const [total, shipments] = await Promise.all([
      this.prisma.tradeShipment.count({ where }),
      this.prisma.tradeShipment.findMany({
        where,
        include: {
          trade: {
            select: { id: true, tradeNumber: true, status: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Resolve shipper / recipient users in a single batched query
    const userIds = Array.from(
      new Set(
        shipments
          .flatMap((s) => [s.shipperId, s.recipientUserId])
          .filter((v): v is string => !!v),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = shipments.map((s) => ({
      ...s,
      shipper: userMap.get(s.shipperId) ?? null,
      recipientUser: s.recipientUserId
        ? userMap.get(s.recipientUserId) ?? null
        : null,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get trade by ID for admin
   */
  async getTradeById(tradeId: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        initiator: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
            addresses: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
                seller: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        shipments: {
          include: {
            events: { orderBy: { eventTime: 'asc' } },
          },
        },
        cashPayment: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    // Resolve product image S3 keys (cardKey) into usable URLs. The frontend
    // renders `item.product.images[0].url`, but ProductImage stores cardKey/detailKey
    // (no `url` column), so without this mapping the photos would not show.
    for (const item of (trade as any).items ?? []) {
      const product = item?.product;
      if (product) {
        product.images = (product.images ?? [])
          .map((img: any) => ({ url: this.resolveProductImageUrl(img?.cardKey) }))
          .filter((img: any) => img.url);
      }
    }

    return trade;
  }

  /**
   * Resolve trade dispute or cancel trade
   */
  async resolveTrade(adminId: string, tradeId: string, dto: { resolution: string; note?: string }) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: true,
        dispute: true,
      },
    });

    if (!trade) {
      throw new NotFoundException('Takas bulunamadı');
    }

    return this.prisma.$transaction(async (tx) => {
      // Get all trade items
      const allItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });

      const productIds = allItems.map((item) => item.productId);

      let updatedTrade;
      let newStatus: TradeStatus;

      if (dto.resolution === 'cancel') {
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
            cancelReason: dto.note || 'Admin tarafından iptal edildi',
          },
        });
      } else if (dto.resolution === 'favor_initiator' || dto.resolution === 'complete_trade') {
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
      } else if (dto.resolution === 'favor_receiver') {
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
            cancelReason: dto.note || 'Alıcı lehine iptal edildi',
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
        throw new BadRequestException('Geçersiz çözüm tipi. Geçerli değerler: cancel, favor_initiator, favor_receiver, complete_trade');
      }

      // Create audit log
      await this.audit.createAuditLog(adminId, 'trade_resolve', 'Trade', tradeId, trade, {
        ...updatedTrade,
        resolution: dto.resolution,
        note: dto.note,
      });

      return { success: true, tradeId, resolution: dto.resolution, status: newStatus };
    });
  }

  // -------- Safe-trade (warehouse escrow) admin flow --------

  /**
   * Resolve the platform warehouse address used as `fromAddressId` for
   * outbound and return shipments. First tries PlatformSetting key
   * `warehouse_address_id`; falls back to the first address of any active
   * admin user. Throws if no warehouse address can be determined.
   */
  private async resolveWarehouseAddressId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const setting = await tx.platformSetting.findUnique({
      where: { settingKey: 'warehouse_address_id' },
    });
    if (setting?.settingValue) {
      const addr = await tx.address.findUnique({
        where: { id: setting.settingValue },
        select: { id: true },
      });
      if (addr) return addr.id;
    }

    // Fallback: any active admin user's first address
    const admin = await tx.adminUser.findFirst({
      where: { isActive: true },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      const fallback = await tx.address.findFirst({
        where: { userId: admin.userId },
        select: { id: true },
      });
      if (fallback) return fallback.id;
    }

    throw new BadRequestException(
      'Depo adresi yapılandırılmamış. Lütfen `warehouse_address_id` platform ayarını tanımlayın.',
    );
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

      const warehouseAddressId = await this.resolveWarehouseAddressId(tx);

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

      const warehouseAddressId = await this.resolveWarehouseAddressId(tx);
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true },
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
      if (shipment.leg !== 'return') {
        throw new BadRequestException('Bu gönderim bir iade gönderimi değil');
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu iade gönderimi zaten teslim edildi olarak işaretlenmiş',
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
        where: { tradeId, leg: 'return' },
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
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
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
        'trade_return_delivered',
        'TradeShipment',
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
    }).then(async (res) => {
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
        'İptal gerekçesi en az 10 karakter olmalıdır',
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
        throw new NotFoundException('Takas bulunamadı');
      }
      if (trade.status !== TradeStatus.shipping_to_warehouse) {
        throw new BadRequestException(
          `Takas durumu '${trade.status}' force-cancel için uygun değil. Beklenen: shipping_to_warehouse.`,
        );
      }
      if (!trade.firstWarehouseArrivalAt) {
        throw new BadRequestException(
          'Hiçbir ürün depoya ulaşmamış; bu endpoint sadece kısmen ulaşmış takaslar için.',
        );
      }

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: 'to_warehouse' },
      });
      const arrived = toWarehouseShipments.find((s) => s.deliveredAt !== null);
      const stuck = toWarehouseShipments.find((s) => s.deliveredAt === null);
      if (!arrived || !stuck) {
        throw new BadRequestException(
          'Hem ulaşmış hem de yolda olan bir kargo bulunamadı; force-cancel için durum uygun değil.',
        );
      }

      const now = new Date();
      let returnShipmentDraft: { id: string; recipientUserId: string; oid: string } | null = null;

      if (sendArrivedItemBack && arrived.recipientUserId === null) {
        // recipientUserId on arrived to_warehouse is the shipper (the original owner).
      }
      if (sendArrivedItemBack) {
        const arrivedOwnerId = arrived.shipperId;
        const warehouseAddressId = await this.resolveWarehouseAddressId(tx);
        const oid = `TRD-${trade.tradeNumber}-RET-STK`
          .replace(/[^a-zA-Z0-9-]/g, '')
          .slice(0, 50);
        const draft = await tx.tradeShipment.create({
          data: {
            tradeId,
            shipperId: adminId,
            fromAddressId: warehouseAddressId,
            carrier: 'pending',
            trackingNumber: null,
            status: ShipmentStatus.pending,
            leg: 'return',
            recipientType: 'user',
            recipientUserId: arrivedOwnerId,
          },
        });
        returnShipmentDraft = { id: draft.id, recipientUserId: arrivedOwnerId, oid };
      }

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: returnShipmentDraft ? TradeStatus.returning : TradeStatus.cancelled,
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
          byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity);
        }
        for (const [productId, qty] of byProduct) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { reservedQuantity: true },
          });
          if (prod) {
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
              },
            });
          }
        }
      }

      await this.audit.createAuditLog(
        adminId,
        'trade_force_cancel_stuck',
        'Trade',
        tradeId,
        trade,
        {
          reason,
          stuckShipmentId: stuck.id,
          arrivedShipmentId: arrived.id,
          returnShipmentId: returnShipmentDraft?.id ?? null,
          newStatus: returnShipmentDraft ? 'returning' : 'cancelled',
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
          !!trade.cashPayment && trade.cashPayment.status === PaymentStatus.completed,
        warehouseAddressId: returnShipmentDraft
          ? await this.resolveWarehouseAddressId(tx)
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
          orderBy: { isDefault: 'desc' },
        });
        if (
          arrivedAddress &&
          this.suratCargoService &&
          this.suratCargoService.isIntegrationEnabled()
        ) {
          const result = await this.suratCargoService.submitShipmentWithRetry({
            idempotencyKey: `surat:trade-stuck-return:${txResult.returnShipmentDraft.oid}`,
            correlationId: `trade-force-cancel-${tradeId}`,
            payload: {
              KisiKurum:
                arrivedAddress.fullName || arrivedUser?.displayName || 'Takas İade',
              SahisBirim: 'Takas Kayıp İade',
              AliciAdresi: arrivedAddress.address,
              Il: normalizeSuratLocation(arrivedAddress.city),
              Ilce: normalizeSuratLocation(arrivedAddress.district),
              TelefonCep: normalizeSuratPhone(arrivedAddress.phone),
              KargoTuru: SuratKargoTuru.Koli,
              OdemeTipi: SuratOdemeTipi.Pesin,
              OzelKargoTakipNo: txResult.returnShipmentDraft.oid,
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
          if (result.ok) {
            await this.prisma.tradeShipment.update({
              where: { id: txResult.returnShipmentDraft.id },
              data: {
                carrier: 'surat',
                trackingNumber: txResult.returnShipmentDraft.oid,
                status: ShipmentStatus.label_created,
                shippedAt: new Date(),
              },
            });
          } else {
            const r = result as any;
            const errMsg =
              r.kind === 'business' ? r.suratMessage : `technical: ${r.code}`;
            this.logger.error(
              `Force-cancel return shipment submit failed for trade ${tradeId}: ${errMsg}`,
            );
          }
        } else {
          await this.prisma.tradeShipment.update({
            where: { id: txResult.returnShipmentDraft.id },
            data: {
              carrier: 'Tarodan Warehouse',
              trackingNumber: `TRK${Date.now()
                .toString(36)
                .toUpperCase()}${Math.random()
                .toString(36)
                .substring(2, 6)
                .toUpperCase()}`,
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
      txResult.stuckShipment.carrier === 'surat' &&
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
          data: { status: 'cancelled' as any },
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
          err?.message ?? 'Bilinmeyen hata (PayTR iade başarısız)';
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
        'Kayıp gerekçesi en az 10 karakter olmalıdır',
      );
    }

    return this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException('Takas bulunamadı');
      }

      const shipment = await tx.tradeShipment.findUnique({
        where: { id: dto.shipmentId },
      });
      if (!shipment || shipment.tradeId !== tradeId) {
        throw new NotFoundException('Gönderim bulunamadı');
      }
      if (shipment.leg !== 'return') {
        throw new BadRequestException(
          'Sadece iade gönderileri kayıp olarak işaretlenebilir',
        );
      }
      if (shipment.deliveredAt) {
        throw new BadRequestException(
          'Bu gönderim zaten teslim edildi; kayıp işaretlenemez',
        );
      }
      if (shipment.lostAt) {
        throw new BadRequestException('Bu gönderim zaten kayıp işaretli');
      }

      const compensationUserId =
        dto.compensateUserId ?? shipment.recipientUserId ?? null;
      if (
        compensationUserId &&
        compensationUserId !== trade.initiatorId &&
        compensationUserId !== trade.receiverId
      ) {
        throw new BadRequestException(
          'Tazminat kullanıcısı bu takasın taraflarından biri olmalı',
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
        where: { tradeId, leg: 'return' },
        select: { id: true, deliveredAt: true, lostAt: true },
      });
      const allResolved =
        returnShipments.length >= 2 &&
        returnShipments.every((s) => s.deliveredAt !== null || s.lostAt !== null);

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
            const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
            await tx.product.update({
              where: { id: productId },
              data: {
                reservedQuantity: newReserved,
                status:
                  newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
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
        'trade_return_shipment_lost',
        'TradeShipment',
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
    }).then(async (res) => {
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
