import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { AdminAuditService } from "./admin-audit.service";
import { ProductStatus, Prisma, type ModerationEvent } from "@prisma/client";
import {
  buildSearchWhere,
  paginate,
  paginateComputedRows,
  resolveOrderBy,
} from "../../common/list";

/**
 * Moderasyon kuyruğu + AI denetim araçları — AdminService'in
 * MODERATION QUEUE bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly moderationAi: ModerationAiClient,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== MODERATION QUEUE ====================

  /**
   * Get moderation queue items
   * Requirement: Content moderation (project.md)
   */
  async getModerationQueue(options: {
    type?: string;
    page: number;
    pageSize: number;
  }) {
    const { type, page, pageSize } = options;
    const skip = (page - 1) * pageSize;

    const items: any[] = [];
    let totalCount = 0;

    // Get pending products if type is 'product' or all
    if (!type || type === "product") {
      const [products, productCount] = await Promise.all([
        this.prisma.product.findMany({
          where: { status: ProductStatus.pending },
          include: {
            seller: { select: { id: true, displayName: true, email: true } },
            category: { select: { id: true, name: true } },
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
          orderBy: { createdAt: "asc" },
          skip: type === "product" ? skip : 0,
          take: type === "product" ? pageSize : 10,
        }),
        this.prisma.product.count({ where: { status: ProductStatus.pending } }),
      ]);

      items.push(
        ...products.map((p) => ({
          id: p.id,
          type: "product",
          title: p.title,
          description: p.description?.substring(0, 200) || "",
          imageUrl: this.resolveProductImageUrl(p.images[0]?.cardKey) || null,
          price: Number(p.price),
          seller: p.seller,
          category: p.category?.name || "Kategorisiz",
          createdAt: p.createdAt,
          status: "pending",
          // AI moderasyon sonuçları (null = henüz denetlenmedi)
          aiCheckStatus: p.aiCheckStatus,
          aiRelevanceScore: p.aiRelevanceScore,
          aiNsfwScore: p.aiNsfwScore,
          aiCheckReason: p.aiCheckReason,
        })),
      );
      totalCount += productCount;
    }

    // Get pending approval messages if type is 'message' or all
    if (!type || type === "message") {
      const [messages, messageCount] = await Promise.all([
        this.prisma.message.findMany({
          where: { status: "pending_approval" },
          include: {
            sender: { select: { id: true, displayName: true, email: true } },
            thread: { select: { id: true } },
          },
          orderBy: { createdAt: "asc" },
          skip: type === "message" ? skip : 0,
          take: type === "message" ? pageSize : 10,
        }),
        this.prisma.message.count({ where: { status: "pending_approval" } }),
      ]);

      items.push(
        ...messages.map((m) => ({
          id: m.id,
          type: "message",
          title: `Mesaj #${m.id.substring(0, 8)}`,
          description: m.content?.substring(0, 200) || "",
          sender: m.sender,
          threadId: m.threadId,
          createdAt: m.createdAt,
          status: "pending_approval",
        })),
      );
      totalCount += messageCount;
    }

    // Get reviews with comments if type is 'review' or all
    if (!type || type === "review") {
      const [reviews, reviewCount] = await Promise.all([
        this.prisma.rating.findMany({
          where: {
            comment: { not: null },
          },
          include: {
            giver: { select: { id: true, displayName: true, email: true } },
            receiver: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: type === "review" ? skip : 0,
          take: type === "review" ? pageSize : 10,
        }),
        this.prisma.rating.count({
          where: {
            comment: { not: null },
          },
        }),
      ]);

      items.push(
        ...reviews.map((r) => ({
          id: r.id,
          type: "review",
          title: `Değerlendirme: ${r.score}/5`,
          description: r.comment?.substring(0, 200) || "Yorum yok",
          score: r.score,
          reviewer: r.giver,
          reviewed: r.receiver,
          createdAt: r.createdAt,
          status: "active",
        })),
      );
      // Don't add to totalCount if already filtered
    }

    // Sort by createdAt
    items.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return {
      data: type ? items : items.slice(0, pageSize),
      meta: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /**
   * Get moderation statistics
   */
  async getModerationStats() {
    const [pendingProducts, pendingMessages, recentReviews, flaggedUsers] =
      await Promise.all([
        this.prisma.product.count({ where: { status: ProductStatus.pending } }),
        this.prisma.message.count({ where: { status: "pending_approval" } }),
        this.prisma.rating.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        // Count users with warnings (using audit log for ban actions)
        this.prisma.auditLog.count({
          where: {
            action: { in: ["user_warn", "user_flag"] },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

    return {
      pendingProducts,
      reportedMessages: pendingMessages,
      recentReviews,
      flaggedUsers,
      totalPending: pendingProducts + pendingMessages,
    };
  }

  /**
   * AI ile denetlenmiş ürünleri skorlarıyla listele (admin "AI Denetim" sayfası).
   */
  async getAiModerationList(options: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, page = 1, pageSize = 20 } = options;
    const where: Prisma.ProductWhereInput = status
      ? { aiCheckStatus: status }
      : { aiCheckStatus: { not: null } };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          seller: { select: { id: true, displayName: true, email: true } },
          images: { take: 1, orderBy: { sortOrder: "asc" } },
        },
        orderBy: { aiCheckedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data: items.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        imageUrl: this.resolveProductImageUrl(p.images[0]?.cardKey) || null,
        seller: p.seller,
        aiCheckStatus: p.aiCheckStatus,
        aiRelevanceScore: p.aiRelevanceScore,
        aiNsfwScore: p.aiNsfwScore,
        aiCheckReason: p.aiCheckReason,
        aiCheckedAt: p.aiCheckedAt,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * Birleşik AI moderasyon günlüğü (admin "AI Denetim" tab'ı + Sistem sayfası).
   * Tüm varlıklar ortak `moderation_events` tablosundan; entityType/entityId ile
   * sayfa-bazlı (ör. tek ürün/kullanıcı/koleksiyon) süzülebilir.
   */
  async getModerationEvents(options: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    decision?: string;
    kind?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    sortType?: "text" | "number" | "date";
  }) {
    const { entityType, entityId, userId, decision, kind, search } = options;
    const where: Prisma.ModerationEventWhereInput = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(userId ? { userId } : {}),
      ...(decision ? { decision } : {}),
      ...(kind ? { kind } : {}),
    };

    if (search?.trim()) {
      const term = search.trim();
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { displayName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const scalarSearch = buildSearchWhere(term, [
        "entityType",
        "entityId",
        "kind",
        "field",
        "decision",
        "reason",
      ]);
      where.OR = [
        ...((scalarSearch?.OR ?? []) as Prisma.ModerationEventWhereInput[]),
        ...(users.length
          ? [{ userId: { in: users.map(({ id }) => id) } }]
          : []),
      ];
    }

    const listQuery = {
      ...options,
      limit: options.limit ?? options.pageSize,
    };
    let users: Array<{ id: string; displayName: string; email: string }> = [];
    let usersLoaded = false;
    let result;
    if (options.sortBy === "user.displayName") {
      const allEvents = await this.prisma.moderationEvent.findMany({ where });
      const allUserIds = [
        ...new Set(
          allEvents
            .map((event) => event.userId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      users = await this.prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, email: true },
      });
      usersLoaded = true;
      const names = new Map(
        users.map((user) => [user.id, user.displayName || user.email]),
      );
      result = paginateComputedRows(
        allEvents,
        (event) => (event.userId ? names.get(event.userId) : undefined),
        { ...listQuery, sortType: "text" },
      );
    } else {
      const orderBy =
        resolveOrderBy<Prisma.ModerationEventOrderByWithRelationInput>(
          "ModerationEvent",
          options,
          { defaultSort: { createdAt: "desc" } },
        );
      result = await paginate(
        this.prisma.moderationEvent,
        { where, orderBy },
        listQuery,
      );
    }
    const rows = result.data as ModerationEvent[];

    // Aktör (içeriği üreten) kullanıcı bilgisini tek sorguda zenginleştir
    const userIds = [
      ...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)),
    ];
    if (!usersLoaded) {
      users = userIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true },
          })
        : [];
    }
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...result,
      data: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        userId: r.userId,
        user: r.userId ? (userMap.get(r.userId) ?? null) : null,
        kind: r.kind,
        field: r.field,
        decision: r.decision,
        relevanceScore: r.relevanceScore,
        nsfwScore: r.nsfwScore,
        reason: r.reason,
        labels: r.labels,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Tek bir görseli AI ile test et (admin "Görsel Test Et" aracı) — ürün oluşturmadan skor gör.
   */
  async testImageModeration(imageUrl: string) {
    if (!imageUrl) {
      throw new BadRequestException("imageUrl gerekli");
    }
    if (!this.moderationAi.isEnabled) {
      return {
        enabled: false,
        message: "AI moderasyon kapalı (AI_MODERATION_ENABLED=false)",
      };
    }
    const result = await this.moderationAi.moderateImage(imageUrl);
    if (!result) {
      return {
        enabled: true,
        error: "AI servisine erişilemedi ya da görsel indirilemedi",
      };
    }
    return { enabled: true, ...result };
  }

  /** AI eşiklerini oku (admin "Kabul Eşiği" ayarı). */
  async getAiConfig() {
    if (!this.moderationAi.isEnabled) {
      return { enabled: false, relevanceThreshold: 0.2, nsfwThreshold: 0.7 };
    }
    const cfg = await this.moderationAi.getConfig();
    return {
      enabled: true,
      relevanceThreshold: cfg?.relevanceThreshold ?? 0.2,
      nsfwThreshold: cfg?.nsfwThreshold ?? 0.7,
    };
  }

  /** AI eşiklerini güncelle (canlı + kalıcı config.json). */
  async setAiConfig(relevanceThreshold?: number, nsfwThreshold?: number) {
    if (!this.moderationAi.isEnabled) {
      throw new BadRequestException("AI moderasyon kapalı");
    }
    const cfg = await this.moderationAi.setConfig({
      relevanceThreshold,
      nsfwThreshold,
    });
    if (!cfg) {
      throw new BadRequestException("AI servisine erişilemedi");
    }
    return { enabled: true, ...cfg };
  }

  /**
   * Approve moderation item
   */
  async approveModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    notes?: string,
  ) {
    switch (type) {
      case "product":
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException("Ürün bulunamadı");

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.active },
        });

        await this.audit.createAuditLog(
          adminId,
          "moderation_approve",
          "Product",
          itemId,
          product,
          {
            status: "active",
            notes,
          },
        );
        break;

      case "message":
        const message = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!message) throw new NotFoundException("Mesaj bulunamadı");

        await this.prisma.message.update({
          where: { id: itemId },
          data: {
            status: "approved",
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.audit.createAuditLog(
          adminId,
          "moderation_approve",
          "Message",
          itemId,
          message,
          {
            status: "approved",
            notes,
          },
        );
        break;

      case "review":
        // Reviews are approved by default, this marks them as "verified"
        await this.audit.createAuditLog(
          adminId,
          "moderation_approve",
          "Rating",
          itemId,
          null,
          {
            verified: true,
            notes,
          },
        );
        break;

      default:
        throw new BadRequestException("Geçersiz moderasyon türü");
    }

    return { success: true, type, id: itemId, action: "approved" };
  }

  /**
   * Reject moderation item
   */
  async rejectModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    notes?: string,
  ) {
    switch (type) {
      case "product":
        const product = await this.prisma.product.findUnique({
          where: { id: itemId },
        });
        if (!product) throw new NotFoundException("Ürün bulunamadı");

        await this.prisma.product.update({
          where: { id: itemId },
          data: { status: ProductStatus.rejected },
        });

        await this.audit.createAuditLog(
          adminId,
          "moderation_reject",
          "Product",
          itemId,
          product,
          {
            status: "rejected",
            reason,
            notes,
          },
        );
        break;

      case "message":
        const messageToReject = await this.prisma.message.findUnique({
          where: { id: itemId },
        });
        if (!messageToReject) throw new NotFoundException("Mesaj bulunamadı");

        // Mark as rejected and hide content
        await this.prisma.message.update({
          where: { id: itemId },
          data: {
            status: "rejected",
            filteredContent: "[Bu mesaj moderatör tarafından kaldırıldı]",
            flaggedReason: reason,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });

        await this.audit.createAuditLog(
          adminId,
          "moderation_reject",
          "Message",
          itemId,
          messageToReject,
          {
            status: "rejected",
            reason,
            notes,
          },
        );
        break;

      case "review":
        const review = await this.prisma.rating.findUnique({
          where: { id: itemId },
        });
        if (!review) throw new NotFoundException("Değerlendirme bulunamadı");

        // Delete the review
        await this.prisma.rating.delete({
          where: { id: itemId },
        });

        await this.audit.createAuditLog(
          adminId,
          "moderation_reject",
          "Rating",
          itemId,
          review,
          {
            deleted: true,
            reason,
            notes,
          },
        );
        break;

      default:
        throw new BadRequestException("Geçersiz moderasyon türü");
    }

    return { success: true, type, id: itemId, action: "rejected", reason };
  }

  /**
   * Flag moderation item for priority review
   */
  async flagModerationItem(
    adminId: string,
    type: string,
    itemId: string,
    reason: string,
    priority?: string,
  ) {
    await this.audit.createAuditLog(
      adminId,
      "moderation_flag",
      type,
      itemId,
      null,
      {
        flagged: true,
        reason,
        priority: priority || "normal",
      },
    );

    return {
      success: true,
      type,
      id: itemId,
      action: "flagged",
      reason,
      priority,
    };
  }
}
