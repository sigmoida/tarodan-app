import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import type { MessageKey } from "@tarodan/i18n";
import { i18nMessage } from "../i18n";
import {
  PUBLIC_IDENTITY_SELECT,
  PUBLIC_NAME_SELECT,
  publicName,
  toPublicIdentity,
} from "../../common/helpers/public-identity";
import {
  BLOCKED_CACHE_TTL_SECONDS,
  MAX_BLOCKS_PER_USER,
  USER_BLOCKED_EVENT,
  UserBlockedPayload,
  blockedCacheKey,
} from "./user-block.constants";

/**
 * UserBlockService — kalıcı kullanıcı engelleme; tüm modüllerin ortak kapısı.
 *
 * Simetrik model: `getHiddenUserIds(viewer)` hem viewer'ın engellediklerini hem
 * de viewer'ı engelleyenleri döndürür. Akış/arama/koleksiyon/profil bu listeyle
 * filtrelenir; DM/teklif/takas `isBlockedEither` ile iki yönlü kapanır.
 *
 * Modül yalnız global Prisma/Cache/EventEmitter'a bağlıdır: Notification →
 * WebSocket → UserBlock döngüsü oluşmasın diye admin bildirimi `user.blocked`
 * olayıyla UserModule'deki listener'a bırakılır.
 */
@Injectable()
export class UserBlockService {
  private readonly logger = new Logger(UserBlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
  ) {}

  async block(
    blockerId: string,
    blockedId: string,
    reason?: string,
  ): Promise<{ success: boolean; blockedDisplayName: string }> {
    if (blockerId === blockedId) {
      throw new BadRequestException(i18nMessage("server.user.cannotBlockSelf"));
    }

    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, ...PUBLIC_NAME_SELECT },
    });
    if (!blockedUser) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(i18nMessage("server.user.alreadyBlocked"));
    }

    const given = await this.prisma.userBlock.count({ where: { blockerId } });
    if (given >= MAX_BLOCKS_PER_USER) {
      throw new BadRequestException(
        i18nMessage("server.user.blockLimitReached"),
      );
    }

    // Engel + iki yönlü takibi tek işlemde bırak: engellenen kişi engelleyeni
    // takip etmeye devam ederse akışı/bildirimleri üzerinden pencere kalır.
    const block = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.userBlock.create({
          data: { blockerId, blockedId, reason: reason?.trim() || null },
        });
        await tx.userFollow.deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: blockedId },
              { followerId: blockedId, followingId: blockerId },
            ],
          },
        });
        return created;
      })
      .catch((err: unknown) => {
        // Çift tıklama / yeniden deneme yarışı: unique ihlali de "zaten engelli".
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          throw new BadRequestException(
            i18nMessage("server.user.alreadyBlocked"),
          );
        }
        throw err;
      });

    await this.invalidate(blockerId, blockedId);
    this.logger.log(`User ${blockerId} blocked user ${blockedId}`);

    const payload: UserBlockedPayload = {
      blockId: block.id,
      blockerId,
      blockedId,
      reason: block.reason,
    };
    this.events.emit(USER_BLOCKED_EVENT, payload);

    return { success: true, blockedDisplayName: publicName(blockedUser) };
  }

  async unblock(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    const deleted = await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(i18nMessage("server.user.notBlocked"));
    }

    await this.invalidate(blockerId, blockedId);
    this.logger.log(`User ${blockerId} unblocked user ${blockedId}`);
    return { success: true };
  }

  /** Viewer'ın kendi engellediği kullanıcı mı? (menüde Engelle/Engeli Kaldır seçimi) */
  async hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    return !!row;
  }

  /** Viewer'ın engellediği kullanıcılar (Engellenenler listesi). */
  async getBlockedUsers(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
      include: { blocked: { select: PUBLIC_IDENTITY_SELECT } },
    });
    return blocks.map((b) => ({
      ...toPublicIdentity(b.blocked),
      blockedAt: b.createdAt,
    }));
  }

  /**
   * Viewer için görünmez olması gereken kullanıcı id'leri: engelledikleri ∪
   * onu engelleyenler. Anonim viewer için boş liste. Sıralı döner ki cache
   * anahtarlarına (ör. products:list) deterministik girsin.
   */
  async getHiddenUserIds(viewerId?: string | null): Promise<string[]> {
    if (!viewerId) return [];
    return this.cache.getOrSet(
      blockedCacheKey(viewerId),
      async () => {
        const rows = await this.prisma.userBlock.findMany({
          where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
          select: { blockerId: true, blockedId: true },
        });
        const ids = new Set<string>();
        for (const r of rows) {
          ids.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
        }
        return Array.from(ids).sort();
      },
      { ttl: BLOCKED_CACHE_TTL_SECONDS },
    );
  }

  /** İki kullanıcıdan biri diğerini engellemiş mi? (DM/teklif/takas kapısı) */
  async isBlockedEither(userA: string, userB: string): Promise<boolean> {
    if (!userA || !userB || userA === userB) return false;
    const hidden = await this.getHiddenUserIds(userA);
    return hidden.includes(userB);
  }

  /**
   * Etkileşim kapısı (DM/teklif/takas/takip/beğeni): iki yönlü engel varsa
   * 403. Modüller kendi mesaj anahtarını verir; kural tek yerde kalır.
   */
  async assertNotBlocked(
    a: string,
    b: string,
    messageKey: MessageKey = "server.user.interactionBlocked",
  ): Promise<void> {
    if (await this.isBlockedEither(a, b)) {
      throw new ForbiddenException(i18nMessage(messageKey));
    }
  }

  /**
   * Görünürlük kapısı (profil/koleksiyon/ilan detayı): sahip ile viewer
   * arasında engel varsa kaynak "yok" davranır — engellendiğini sızdırmamak
   * için 403 değil 404. Anonim viewer ve sahibin kendisi her zaman geçer.
   */
  async assertVisibleTo(
    viewerId: string | undefined | null,
    ownerId: string,
    notFoundKey: MessageKey,
  ): Promise<void> {
    if (!viewerId || viewerId === ownerId) return;
    if (await this.isBlockedEither(viewerId, ownerId)) {
      throw new NotFoundException(i18nMessage(notFoundKey));
    }
  }

  private async invalidate(a: string, b: string): Promise<void> {
    await Promise.all([
      this.cache.del(blockedCacheKey(a)),
      this.cache.del(blockedCacheKey(b)),
    ]);
  }
}
