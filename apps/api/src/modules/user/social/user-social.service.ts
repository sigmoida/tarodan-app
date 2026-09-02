import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { UserCommonService } from "../user-common.service";
import { i18nMessage } from "../../i18n";
import { UserBlockService } from "../../user-block/user-block.service";
import { catalogProductWhere } from "../../product/helpers/catalog-product-where";
import {
  PUBLIC_IDENTITY_SELECT,
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../../common/helpers/public-identity";

/**
 * UserSocialService — takip (follow/unfollow/checkFollowing/getFollowing).
 * Engelleme çağrıları UserBlockService'e delege edilir (kalıcı, simetrik).
 * Avatar çözümü için common'a delege eder.
 */
@Injectable()
export class UserSocialService {
  private readonly logger = new Logger(UserSocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly common: UserCommonService,
    private readonly blocks: UserBlockService,
  ) {}

  /**
   * Check if current user is following target user
   */
  async checkFollowing(currentUserId: string, targetUserId: string) {
    const follow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    return { following: !!follow };
  }

  /**
   * Follow a user
   */
  async followUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException(
        i18nMessage("server.user.cannotFollowSelf"),
      );
    }

    // Engel anında iki yönlü takip silinir; engelli taraf yeniden takip edip
    // NEW_FOLLOWER bildirimi/e-postası düşüremez.
    await this.blocks.assertNotBlocked(currentUserId, targetUserId);

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    // Check if already following
    const existingFollow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      // #224: bu iki başarı mesajı (satır burada + fonksiyon sonu) durum-bağımlı dal
      // (zaten takip ediyor vs yeni takip, bildirim yan etkisiyle iç içe) — locale
      // servise akmıyor, invasive, taşınmadı (rapora bkz).
      return {
        message: "Zaten takip ediyorsunuz",
        following: true,
      };
    }

    // Create follow relationship
    await this.prisma.userFollow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
    });

    // Send notification to the followed user
    try {
      const follower = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: PUBLIC_NAME_SELECT,
      });

      await this.notificationService.createInAppNotification(
        targetUserId,
        NotificationType.NEW_FOLLOWER,
        {
          followerId: currentUserId,
          followerName: publicName(follower),
        },
      );
      await this.notificationService.sendTemplateEmailToUser(
        targetUserId,
        "new-follower",
        {
          followerName: publicName(follower),
          followerId: currentUserId,
        },
      );
    } catch (error) {
      this.logger.error("Failed to send follow notification:", error);
    }

    return {
      message: "Kullanıcı takip edildi",
      following: true,
    };
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<{ following: boolean }> {
    if (currentUserId === targetUserId) {
      throw new BadRequestException(
        i18nMessage("server.user.cannotUnfollowSelf"),
      );
    }

    // Delete follow relationship
    try {
      await this.prisma.userFollow.delete({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
    } catch (error) {
      // Not following, ignore
    }

    // #224: mesaj artık UserController.unfollowUser() tarafından locale'e göre
    // kuruluyor (server.user.unfollowed) — servis burada sabit metin döndürmüyor.
    return {
      following: false,
    };
  }

  /**
   * Get users that current user is following
   */
  async getFollowing(userId: string) {
    const following = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            ...PUBLIC_IDENTITY_SELECT,
            bio: true,
            _count: {
              select: {
                products: {
                  where: {
                    ...catalogProductWhere(),
                    status: "active",
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const resolved = await Promise.all(
      following.map(async (f: any) => ({
        ...f,
        following: f.following
          ? {
              ...f.following,
              avatarUrl: await this.common.resolveAvatarUrl(
                f.following.avatarUrl,
              ),
            }
          : f.following,
      })),
    );

    return { following: resolved };
  }

  // ── Engelleme: kalıcı kaynak UserBlockService (user-block modülü) ──────
  // Controller route'ları burada kalsın diye ince delegasyon; mantık ve cache
  // tek yerde (simetrik gizleme, iki yönlü unfollow, admin olayı).

  blockUser(blockerId: string, blockedId: string, reason?: string) {
    return this.blocks.block(blockerId, blockedId, reason);
  }

  unblockUser(blockerId: string, blockedId: string) {
    return this.blocks.unblock(blockerId, blockedId);
  }

  /** Engellenenler listesi; avatar anahtarı burada presigned URL'ye çözülür. */
  async getBlockedUsers(userId: string) {
    const blocked = await this.blocks.getBlockedUsers(userId);
    return Promise.all(
      blocked.map(async (u) => ({
        ...u,
        avatarUrl: await this.common.resolveAvatarUrl(u.avatarUrl),
      })),
    );
  }

  hasBlocked(blockerId: string, blockedId: string) {
    return this.blocks.hasBlocked(blockerId, blockedId);
  }
}
