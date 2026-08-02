import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { UserCommonService } from "./user-common.service";
import { i18nMessage } from "../i18n";
import { randomUUID } from "crypto";

// In-memory storage for user blocks until schema is updated
interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

/**
 * UserSocialService — takip (follow/unfollow/checkFollowing/getFollowing) ve
 * engelleme (block/unblock/getBlockedUsers/isUserBlocked/areUsersBlocked).
 * Engeller in-memory Map'te tutulur (şema henüz güncellenmedi); bu yüzden tüm
 * engelleme metotları TEK serviste kalır ki aynı Map örneğini paylaşsınlar.
 * Avatar çözümü için common'a delege eder.
 */
@Injectable()
export class UserSocialService {
  private readonly logger = new Logger(UserSocialService.name);

  // Temporary in-memory storage for user blocks
  private userBlocks: Map<string, UserBlock> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly common: UserCommonService,
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
        select: { displayName: true },
      });

      await this.notificationService.createInAppNotification(
        targetUserId,
        NotificationType.NEW_FOLLOWER,
        {
          followerId: currentUserId,
          followerName: follower?.displayName || "Bir kullanıcı",
        },
      );
      await this.notificationService.sendTemplateEmailToUser(
        targetUserId,
        "new-follower",
        {
          followerName: follower?.displayName || "Bir kullanıcı",
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
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            _count: {
              select: {
                products: {
                  where: { status: "active" },
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

  /**
   * Block a user
   */
  async blockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean; blockedDisplayName: string }> {
    // Cannot block yourself
    if (blockerId === blockedId) {
      throw new BadRequestException(i18nMessage("server.user.cannotBlockSelf"));
    }

    // Check if blocked user exists
    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, displayName: true },
    });

    if (!blockedUser) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    // Check if already blocked
    const existingBlock = Array.from(this.userBlocks.values()).find(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );

    if (existingBlock) {
      throw new BadRequestException(i18nMessage("server.user.alreadyBlocked"));
    }

    // Create block
    const block: UserBlock = {
      id: this.generateUUID(),
      blockerId,
      blockedId,
      createdAt: new Date(),
    };

    this.userBlocks.set(block.id, block);

    this.logger.log(`User ${blockerId} blocked user ${blockedId}`);

    // #224: mesaj artık UserController.blockUser() tarafından locale'e göre
    // kuruluyor (server.user.userBlocked, {displayName} parametreli) — servis
    // burada sabit metin döndürmüyor.
    return { success: true, blockedDisplayName: blockedUser.displayName };
  }

  /**
   * Unblock a user
   */
  async unblockUser(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    // Find the block
    const block = Array.from(this.userBlocks.values()).find(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );

    if (!block) {
      throw new NotFoundException(i18nMessage("server.user.notBlocked"));
    }

    // Remove block
    this.userBlocks.delete(block.id);

    this.logger.log(`User ${blockerId} unblocked user ${blockedId}`);

    // #224: mesaj artık UserController.unblockUser() tarafından locale'e göre
    // kuruluyor (server.user.userUnblocked) — servis burada sabit metin döndürmüyor.
    return { success: true };
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    const blocks = Array.from(this.userBlocks.values()).filter(
      (b) => b.blockerId === userId,
    );

    const blockedUserIds = blocks.map((b) => b.blockedId);

    if (blockedUserIds.length === 0) {
      return [];
    }

    const blockedUsers = await this.prisma.user.findMany({
      where: { id: { in: blockedUserIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return blockedUsers.map((user) => ({
      ...user,
      blockedAt: blocks.find((b) => b.blockedId === user.id)?.createdAt,
    }));
  }

  /**
   * Check if a user is blocked
   */
  isUserBlocked(blockerId: string, blockedId: string): boolean {
    return Array.from(this.userBlocks.values()).some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );
  }

  /**
   * Check if either user has blocked the other
   */
  areUsersBlocked(userId1: string, userId2: string): boolean {
    return Array.from(this.userBlocks.values()).some(
      (b) =>
        (b.blockerId === userId1 && b.blockedId === userId2) ||
        (b.blockerId === userId2 && b.blockedId === userId1),
    );
  }

  private generateUUID(): string {
    return randomUUID();
  }
}
