import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma } from "@prisma/client";
import {
  AdminShipmentQueryDto,
  CarrierCancellationTaskQueryDto,
  ResolveCarrierCancellationTaskDto,
} from "./dto";
import { buildSearchWhere, paginate, resolveOrderBy } from "../../common/list";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { SuratTrackingService } from "../surat-cargo/surat-tracking.service";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";
import { requestCarrierCancellationTask } from "../surat-cargo/carrier-cancellation-task";
import { StorageService } from "../storage/storage.service";
import { i18nMessage } from "../i18n";

/**
 * Kargo görünümü admin operasyonları (salt-okunur) — AdminService'in
 * SHIPPING (view-only) bölümünden birebir taşındı. AdminService aynı
 * imzalarla buraya delege eder.
 */
@Injectable()
export class AdminShippingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService?: StorageService,
    @Optional()
    private readonly suratCargoService?: SuratCargoService,
    @Optional()
    private readonly suratTrackingService?: SuratTrackingService,
  ) {}

  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        if (parsed.searchParams.has("X-Amz-Signature")) parsed.search = "";
        return parsed.toString();
      } catch {
        return imageKeyOrUrl;
      }
    }
    return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
  }

  // ==================== SHIPPING (view-only) ====================

  /**
   * Get list of shipments
   */
  async getShipments(query: AdminShipmentQueryDto) {
    const { status, carrierId, search } = query;
    const where: Prisma.ShipmentWhereInput = {
      ...(buildSearchWhere(search, [
        "order.orderNumber",
        "order.buyer.displayName",
        "order.buyer.email",
        "order.seller.displayName",
        "order.seller.email",
        "provider",
        "orderPackage.packageNumber",
        "trackingNumber",
        "providerTrackingId",
        "providerRawStatus",
        "receivedBy",
        "returnReason",
      ]) as Prisma.ShipmentWhereInput | undefined),
    };
    const pagination = { ...query, limit: query.limit ?? 20 };

    if (status) where.status = status as any;
    if (carrierId) where.provider = carrierId;

    // Varsayılan sıralama paket bitişikliğini korur: aynı OrderPackage'ın
    // kargoları art arda gelir → sayfa-lokal koli birleştirme sayfa sınırında
    // NADİREN bölünür (aynı paket iki sayfaya yayılmaz — art arda dizilidir).
    const orderBy = resolveOrderBy<Prisma.ShipmentOrderByWithRelationInput>(
      "Shipment",
      query,
      {
        defaultSort: [
          { order: { packageId: "desc" } },
          { createdAt: "desc" },
        ] as any,
      },
    );

    const result = await paginate(
      this.prisma.shipment,
      {
        where,
        include: {
          // Koli numarası (PKG-…) — kargo etiketindeki ve Sürat'a giden kod.
          // Kolonun kaynağı artık uuid'den uydurulmuş değil, gerçek alan.
          orderPackage: { select: { packageNumber: true } },
          order: {
            // `include` returns every Order scalar, so `packageId` (the per-seller
            // OrderPackage) and `quantity` come along for free. Same-seller orders
            // in a checkout group share ONE physical Sürat gönderi but keep a
            // Shipment row each; the admin list groups siblings that share a
            // `packageId` into a single physical-parcel row and shows the package's
            // order line-items (product below), so a 2-seller cart = 2 rows, not 3.
            include: {
              buyer: { select: { id: true, displayName: true, email: true } },
              seller: { select: { id: true, displayName: true, email: true } },
              product: {
                select: {
                  id: true,
                  title: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: "asc" },
                    select: { cardKey: true },
                  },
                },
              },
            },
          },
        },
        orderBy,
      },
      pagination,
    );

    return {
      ...result,
      data: result.data.map((shipment: any) => ({
        ...shipment,
        order: shipment.order
          ? {
              ...shipment.order,
              product: shipment.order.product
                ? {
                    id: shipment.order.product.id,
                    title: shipment.order.product.title,
                    imageUrl: this.resolveProductImageUrl(
                      shipment.order.product.images?.[0]?.cardKey,
                    ),
                  }
                : null,
            }
          : null,
      })),
    };
  }

  async getCarrierCancellationTasks(query: CarrierCancellationTaskQueryDto) {
    const where: Prisma.CarrierCancellationTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                reference: {
                  contains: query.search.trim(),
                  mode: "insensitive",
                },
              },
              {
                entityId: {
                  contains: query.search.trim(),
                  mode: "insensitive",
                },
              },
              {
                reason: { contains: query.search.trim(), mode: "insensitive" },
              },
            ],
          }
        : {}),
    };
    const page = await paginate(
      this.prisma.carrierCancellationTask,
      { where, orderBy: { requestedAt: "desc" } },
      { ...query, limit: query.limit ?? 20 },
    );
    const resolverIds = [
      ...new Set(
        page.data
          .map((task) => task.resolvedBy)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const resolvers = resolverIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: resolverIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const resolverById = new Map(resolvers.map((user) => [user.id, user]));
    return {
      ...page,
      data: page.data.map((task) => ({
        ...task,
        resolvedByAdmin: task.resolvedBy
          ? (resolverById.get(task.resolvedBy) ?? null)
          : null,
      })),
    };
  }

  async resolveCarrierCancellationTask(
    taskId: string,
    adminId: string,
    dto: ResolveCarrierCancellationTaskDto,
  ) {
    const resolution = dto.resolution.trim();
    if (!resolution) {
      throw new BadRequestException(
        i18nMessage("server.admin.resolutionNoteRequired"),
      );
    }
    const updated = await this.prisma.carrierCancellationTask.updateMany({
      where: { id: taskId, status: "pending" },
      data: {
        status: dto.status,
        resolution,
        resolvedAt: new Date(),
        resolvedBy: adminId,
      },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.carrierCancellationTask.findUnique({
        where: { id: taskId },
      });
      if (!exists)
        throw new NotFoundException(
          i18nMessage("server.admin.carrierCancellation.notFound"),
        );
      throw new BadRequestException(
        i18nMessage("server.admin.carrierCancellation.alreadySettled"),
      );
    }
    return this.prisma.carrierCancellationTask.findUnique({
      where: { id: taskId },
    });
  }

  /**
   * Admin manuel takip senkronu: bir Sürat kargosunun güncel durumunu 30 dk'lık
   * cron'u beklemeden anında Sürat takip API'sinden çeker ve DB'ye yazar.
   * Kargo panelindeki "Takibi Yenile" butonu bunu kullanır.
   */
  async syncShipmentTracking(
    shipmentId: string,
  ): Promise<{ ok: boolean; message: string; shipment?: any }> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) {
      return { ok: false, message: "Gönderi bulunamadı" };
    }
    if (shipment.provider !== "surat") {
      return { ok: false, message: "Bu gönderi Sürat kargo değil" };
    }
    if (!this.suratTrackingService) {
      return { ok: false, message: "Takip servisi kullanılamıyor" };
    }

    const updated =
      await this.suratTrackingService.syncShipmentTracking(shipmentId);
    const fresh = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    return {
      ok: updated,
      message: updated
        ? "Takip bilgisi güncellendi"
        : "Sürat’tan güncelleme alınamadı (kargo henüz hareket görmemiş ya da takip numarası yok olabilir)",
      shipment: fresh,
    };
  }

  /**
   * Sürat REST endpoint testi: sunucudan Sürat'a gerçek bir test gönderisi oluşturur
   * (GonderiyiKargoyaGonder) ve hemen aynı referansla takibini sorgular
   * (KargoTakipHareketDetayi). Sipariş verisine dokunmaz; başarılı oluşturma
   * sonrasında dış gönderinin manuel temizlenebilmesi için kalıcı görev kaydeder.
   * Admin "Sürat Endpoint Testi" paneli kullanır.
   */
  async runSuratEndpointTest(adminId: string): Promise<{
    ref: string;
    enabled: boolean;
    create: { ok: boolean; message: string };
    track: any;
    cleanupTask: { ok: boolean; id?: string; error?: string } | null;
  }> {
    const ref = `ADMIN-TEST-${Date.now()}`;

    if (!this.suratCargoService) {
      return {
        ref,
        enabled: false,
        create: { ok: false, message: "Sürat servisi kullanılamıyor" },
        track: null,
        cleanupTask: null,
      };
    }
    if (!this.suratCargoService.isIntegrationEnabled()) {
      return {
        ref,
        enabled: false,
        create: {
          ok: false,
          message: "SURAT_CARGO_ENABLED kapalı (Coolify env kontrol et)",
        },
        track: null,
        cleanupTask: null,
      };
    }

    // 1) Gönderi oluştur — Sürat'a gerçek test gönderisi (REST create)
    const createResult = await this.suratCargoService.submitShipmentWithRetry({
      idempotencyKey: ref,
      correlationId: ref,
      payload: buildStandardGonderiPayload({
        recipientName: "ADMIN TEST ALICI",
        address: "Caferağa Mah. Moda Cad. No:14",
        city: "İstanbul",
        district: "Kadıköy",
        phone: "5321112233",
        ref,
        content: "Endpoint testi",
        // Test payload'u telefonu HAM (05xx normalizasyonu olmadan) gönderir;
        // builder normalize eder → birebir korumak için override.
        overrides: { TelefonCep: "5321112233" },
      }),
    });

    const create = createResult.ok
      ? { ok: true, message: "Sürat gönderi oluşturuldu (başarılı)" }
      : {
          ok: false,
          message:
            (createResult as any).suratMessage ||
            `teknik hata: ${(createResult as any).code ?? "bilinmiyor"}`,
        };

    let cleanupTask: { ok: boolean; id?: string; error?: string } | null = null;
    if (createResult.ok) {
      try {
        const task = await requestCarrierCancellationTask(this.prisma, {
          provider: "surat",
          reference: ref,
          entityType: "admin_endpoint_test",
          entityId: ref,
          reason: "admin_endpoint_test_cleanup",
          metadata: {
            requestedBy: adminId,
            createdAt: new Date().toISOString(),
          },
        });
        cleanupTask = { ok: true, id: task.id };
      } catch (error: any) {
        cleanupTask = {
          ok: false,
          error: error?.message ?? String(error),
        };
      }
    }

    // 2) Aynı referansla takibi sorgula — dış kayıt oluştuysa temizleme görevi
    // garanti altına alındıktan sonra Sürat'tan durum oku (REST tracking).
    let track: any = { ok: false, error: "Takip servisi kullanılamıyor" };
    if (this.suratTrackingService) {
      try {
        track = await this.suratTrackingService.probeTracking(ref);
      } catch (error: any) {
        track = { ok: false, error: error?.message ?? String(error) };
      }
    }

    return { ref, enabled: true, create, track, cleanupTask };
  }

  /**
   * Test konsolu: verilen referansla Sürat takip endpoint'ini (KargoTakipHareketDetayi)
   * ham olarak sorgular. DB'ye dokunmaz.
   */
  async suratTestTrack(ref: string): Promise<any> {
    if (!ref?.trim())
      return { ok: false, error: "Referans (OzelKargoTakipNo) gerekli" };
    if (!this.suratTrackingService)
      return { ok: false, error: "Takip servisi kullanılamıyor" };
    return this.suratTrackingService.probeTracking(ref.trim());
  }

  /**
   * Kargo mutabakatı: müşteriden alınan kargo (alıcı payı) ile Sürat'ın gerçek
   * faturaladığı tutarı karşılaştırır. delta > 0 platform kârı, < 0 zarar. Yalnız
   * taşıyıcı maliyeti senkronlanmış (carrierActualCost dolu) gönderiler.
   */
  async getShippingReconciliation(limit = 100) {
    const take = Math.min(Math.max(limit, 1), 500);
    const shipments = await this.prisma.shipment.findMany({
      where: { carrierActualCost: { not: null } },
      orderBy: { carrierCostSyncedAt: "desc" },
      take,
      select: {
        id: true,
        provider: true,
        carrierActualCost: true,
        carrierNetCost: true,
        carrierTaxAmount: true,
        carrierDesi: true,
        carrierCostSyncedAt: true,
        order: {
          select: {
            orderNumber: true,
            shippingCost: true,
            buyerShippingAmount: true,
          },
        },
      },
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = shipments.map((s) => {
      const charged = Number(
        s.order?.buyerShippingAmount ?? s.order?.shippingCost ?? 0,
      );
      const carrier = Number(s.carrierActualCost ?? 0);
      return {
        shipmentId: s.id,
        orderNumber: s.order?.orderNumber ?? null,
        provider: s.provider,
        chargedShipping: charged,
        carrierActualCost: carrier,
        carrierNetCost:
          s.carrierNetCost != null ? Number(s.carrierNetCost) : null,
        carrierTaxAmount:
          s.carrierTaxAmount != null ? Number(s.carrierTaxAmount) : null,
        carrierDesi: s.carrierDesi != null ? Number(s.carrierDesi) : null,
        delta: round(charged - carrier),
        syncedAt: s.carrierCostSyncedAt,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        chargedTotal: acc.chargedTotal + r.chargedShipping,
        carrierTotal: acc.carrierTotal + r.carrierActualCost,
        deltaTotal: acc.deltaTotal + r.delta,
      }),
      { chargedTotal: 0, carrierTotal: 0, deltaTotal: 0 },
    );

    return {
      rows,
      totals: {
        chargedTotal: round(totals.chargedTotal),
        carrierTotal: round(totals.carrierTotal),
        deltaTotal: round(totals.deltaTotal),
        count: rows.length,
      },
    };
  }
}
