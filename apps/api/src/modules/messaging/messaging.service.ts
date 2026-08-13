import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";
import { ContentFilterService } from "./content-filter.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { RealtimeService } from "../websocket/realtime.service";
import { MessageStatus, Prisma } from "@prisma/client";
import {
  CreateThreadDto,
  SendMessageDto,
  ThreadQueryDto,
  MessageQueryDto,
  PendingMessageQueryDto,
  MessageResponseDto,
  MessageThreadResponseDto,
  ThreadListResponseDto,
  MessageListResponseDto,
  PendingMessagesResponseDto,
} from "./dto";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

// Daily message limit - now read from platform settings (default: 50)

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentFilterService: ContentFilterService,
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly storageService: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    // avatars S3'te public-read → cache'lenebilir doğrudan URL (presigned'a gerek yok)
    return this.storageService?.getPublicAssetUrl(avatarUrl) ?? null;
  }

  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    if (isPublicStorageKey(imageKeyOrUrl)) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==========================================================================
  // CREATE THREAD & SEND FIRST MESSAGE
  // ==========================================================================
  async createThread(
    senderId: string,
    dto: CreateThreadDto,
  ): Promise<MessageThreadResponseDto> {
    // Get effective recipient ID (handles participantId alias)
    const recipientId = dto.getRecipientId();

    if (!recipientId) {
      throw new BadRequestException(
        "Alıcı kullanıcı ID gereklidir (recipientId veya participantId)",
      );
    }

    // Cannot message yourself
    if (senderId === recipientId) {
      throw new BadRequestException("Kendinize mesaj gönderemezsiniz");
    }

    // Verify recipient exists
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new NotFoundException("Alıcı kullanıcı bulunamadı");
    }

    // Verify product if provided
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product) {
        throw new NotFoundException("Ürün bulunamadı");
      }
    }

    // Normalize participant IDs (always store smaller ID first)
    const [participant1Id, participant2Id] = [senderId, recipientId].sort();

    // One thread per participant pair (Scenario B) — the product is only a
    // per-message / latest-context hint, never part of the thread identity.
    let thread = await this.prisma.messageThread.findFirst({
      where: { participant1Id, participant2Id },
    });

    if (thread) {
      // Thread exists: send the message (carrying product context) if provided.
      if (dto.message) {
        await this.sendMessage(thread.id, senderId, {
          content: dto.message,
          productId: dto.productId,
        });
      } else if (dto.productId) {
        // No message but a product was opened → keep it as the latest context.
        await this.prisma.messageThread.update({
          where: { id: thread.id },
          data: { productId: dto.productId },
        });
      }
      return this.getThreadById(thread.id, senderId);
    }

    // Create new thread
    thread = await this.prisma.messageThread.create({
      data: {
        participant1Id,
        participant2Id,
        ...(dto.productId ? { productId: dto.productId } : {}),
      },
    });

    // Send first message if provided (with product context).
    if (dto.message) {
      await this.sendMessage(thread.id, senderId, {
        content: dto.message,
        productId: dto.productId,
      });
    }

    return this.getThreadById(thread.id, senderId);
  }

  // ==========================================================================
  // SEND MESSAGE IN THREAD
  // ==========================================================================
  async sendMessage(
    threadId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    // Check message length from platform settings
    const maxLengthSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "max_message_length" },
    });
    const maxLength = maxLengthSetting?.settingValue
      ? parseInt(maxLengthSetting.settingValue, 10)
      : 1000; // Default: 1000

    if (dto.content.length > maxLength) {
      throw new BadRequestException(
        `Mesaj uzunluğu maksimum ${maxLength} karakter olabilir. Mevcut uzunluk: ${dto.content.length}`,
      );
    }

    // Get thread and verify sender is participant
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException("Mesaj konusu bulunamadı");
    }

    if (
      thread.participant1Id !== senderId &&
      thread.participant2Id !== senderId
    ) {
      throw new ForbiddenException("Bu konuya mesaj gönderme yetkiniz yok");
    }

    // Determine receiver
    const receiverId =
      thread.participant1Id === senderId
        ? thread.participant2Id
        : thread.participant1Id;

    // Apply content filtering
    const filterResult = await this.contentFilterService.moderateWithAI(
      dto.content,
    );

    // Determine message status based on filter result
    let status: MessageStatus;
    if (filterResult.isClean) {
      status = MessageStatus.sent;
    } else if (filterResult.requiresApproval) {
      status = MessageStatus.pending_approval;
    } else {
      // Flagged but doesn't require approval - auto-filter and send
      status = MessageStatus.sent;
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        threadId,
        senderId,
        receiverId,
        productId: dto.productId || null,
        content: dto.content,
        filteredContent: filterResult.isClean
          ? null
          : filterResult.filteredContent,
        status,
        flaggedReason: filterResult.flaggedReason,
      },
      include: {
        sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });

    // Update thread last message time; when the message carries a product
    // context, it also becomes the thread's most-recently discussed product.
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: {
        lastMessageAt: new Date(),
        ...(dto.productId ? { productId: dto.productId } : {}),
      },
    });

    if (status === MessageStatus.sent) {
      // Get short preview of message (first 50 chars)
      const messagePreview =
        dto.content.length > 50
          ? dto.content.substring(0, 50) + "..."
          : dto.content;

      // CANLI TESLİMAT ÖNCE ve bildirimden BAĞIMSIZ.
      //
      // İkisi tek try/catch içindeydi ve bildirim önce çalışıyordu: bildirim
      // servisi hata verdiğinde emit hiç çalışmıyor, alıcının açık sohbeti
      // sessiz kalıyor ve okunmamış rozeti ancak yoklamayla düzeliyordu.
      try {
        const unreadCount = await this.getUnreadMessageCount(receiverId);
        this.realtime.emitNewMessage(
          threadId,
          receiverId,
          this.mapMessageToDto(message),
          {
            threadId,
            lastMessagePreview: messagePreview,
            lastMessageAt: new Date().toISOString(),
            unreadCount,
          },
        );
      } catch (error) {
        this.logger.error("Failed to emit new message event:", error);
      }

      try {
        await this.notificationService.createInAppNotification(
          receiverId,
          NotificationType.NEW_MESSAGE,
          {
            threadId,
            senderName: publicName(message.sender),
            messagePreview,
          },
        );
      } catch (error) {
        this.logger.error("Failed to send message notification:", error);
      }
    }

    return this.mapMessageToDto(message);
  }

  // ==========================================================================
  // GET USER'S THREADS
  // ==========================================================================
  async getUserThreads(
    userId: string,
    query: ThreadQueryDto,
  ): Promise<ThreadListResponseDto> {
    const { page = 1, pageSize = 20 } = query;

    const where: Prisma.MessageThreadWhereInput = {
      OR: [{ participant1Id: userId }, { participant2Id: userId }],
    };

    const [threads, total] = await Promise.all([
      this.prisma.messageThread.findMany({
        where,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            // Reddedilmiş/onay bekleyen mesajları önizlemeye yansıtma — detay
            // ekranı da bunları gizliyor (bkz. getThreadMessages); tutarlı olsun.
            where: {
              status: { in: [MessageStatus.sent, MessageStatus.approved] },
            },
            include: {
              sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
              receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.messageThread.count({ where }),
    ]);

    // Get participant info and unread counts
    const threadDtos: MessageThreadResponseDto[] = await Promise.all(
      threads.map(async (thread) => {
        const [participant1, participant2, product, unreadCount] =
          await Promise.all([
            this.prisma.user.findUnique({
              where: { id: thread.participant1Id },
              select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
            }),
            this.prisma.user.findUnique({
              where: { id: thread.participant2Id },
              select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
            }),
            thread.productId
              ? this.prisma.product.findUnique({
                  where: { id: thread.productId },
                  select: { id: true, title: true, images: { take: 1 } },
                })
              : null,
            this.prisma.message.count({
              where: {
                threadId: thread.id,
                receiverId: userId,
                readAt: null,
                status: { in: [MessageStatus.sent, MessageStatus.approved] },
              },
            }),
          ]);

        const lastMessage = thread.messages[0];

        return {
          id: thread.id,
          participant1Id: thread.participant1Id,
          participant1Name: publicName(participant1),
          participant1AvatarUrl: await this.resolveAvatarUrl(
            participant1?.avatarUrl,
          ),
          participant2Id: thread.participant2Id,
          participant2Name: publicName(participant2),
          participant2AvatarUrl: await this.resolveAvatarUrl(
            participant2?.avatarUrl,
          ),
          productId: thread.productId || undefined,
          productTitle: product?.title,
          productImage: this.resolveProductImageUrl(
            product?.images?.[0]?.cardKey,
          ),
          lastMessage: lastMessage
            ? this.mapMessageToDto(lastMessage)
            : undefined,
          unreadCount,
          lastMessageAt: thread.lastMessageAt,
          createdAt: thread.createdAt,
        };
      }),
    );

    return {
      threads: threadDtos,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Kullanıcının TÜM thread'lerindeki toplam okunmamış mesaj sayısı — sayfalamadan
   * bağımsız tek sorgu. (Header rozeti önceden 20'lik thread sayfasının unreadCount'larını
   * topluyordu → >20 thread'de eksik sayıyordu.) Per-thread unreadCount formülünün toplamı
   * = receiverId=me, okunmamış, görünür statü.
   */
  async getUnreadMessageCount(userId: string): Promise<number> {
    return this.prisma.message.count({
      where: {
        receiverId: userId,
        readAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
      },
    });
  }

  // ==========================================================================
  // GET THREAD BY ID
  // ==========================================================================
  async getThreadById(
    threadId: string,
    userId: string,
  ): Promise<MessageThreadResponseDto> {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException("Mesaj konusu bulunamadı");
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      throw new ForbiddenException("Bu konuyu görüntüleme yetkiniz yok");
    }

    const [participant1, participant2, product, lastMessage, unreadCount] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: thread.participant1Id },
          select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
        }),
        this.prisma.user.findUnique({
          where: { id: thread.participant2Id },
          select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
        }),
        thread.productId
          ? this.prisma.product.findUnique({
              where: { id: thread.productId },
              select: { id: true, title: true, images: { take: 1 } },
            })
          : null,
        this.prisma.message.findFirst({
          where: { threadId },
          orderBy: { createdAt: "desc" },
          include: {
            sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
            receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          },
        }),
        this.prisma.message.count({
          where: {
            threadId,
            receiverId: userId,
            readAt: null,
            status: { in: [MessageStatus.sent, MessageStatus.approved] },
          },
        }),
      ]);

    return {
      id: thread.id,
      participant1Id: thread.participant1Id,
      participant1Name: publicName(participant1),
      participant1AvatarUrl: await this.resolveAvatarUrl(
        participant1?.avatarUrl,
      ),
      participant2Id: thread.participant2Id,
      participant2Name: publicName(participant2),
      participant2AvatarUrl: await this.resolveAvatarUrl(
        participant2?.avatarUrl,
      ),
      productId: thread.productId || undefined,
      productTitle: product?.title,
      productImage: this.resolveProductImageUrl(product?.images?.[0]?.cardKey),
      lastMessage: lastMessage ? this.mapMessageToDto(lastMessage) : undefined,
      unreadCount,
      lastMessageAt: thread.lastMessageAt,
      createdAt: thread.createdAt,
    };
  }

  // ==========================================================================
  // GET MESSAGES IN THREAD
  // ==========================================================================
  async getThreadMessages(
    threadId: string,
    userId: string,
    query: MessageQueryDto,
  ): Promise<MessageListResponseDto> {
    const { page = 1, pageSize = 50, since } = query;

    // Verify access
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException("Mesaj konusu bulunamadı");
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      throw new ForbiddenException("Bu konuyu görüntüleme yetkiniz yok");
    }

    const where: Prisma.MessageWhereInput = {
      threadId,
      status: { in: [MessageStatus.sent, MessageStatus.approved] },
    };

    if (since) {
      where.createdAt = { gt: new Date(since) };
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    // Mark messages as read
    const unread = await this.prisma.message.findMany({
      where: {
        threadId,
        receiverId: userId,
        readAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
      },
      select: { id: true },
    });
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id);
      await this.prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { readAt: new Date() },
      });
      this.realtime.emitMessageRead(threadId, userId, ids);
    }

    return {
      messages: messages.map((m) => this.mapMessageToDto(m)),
      total,
      page,
      pageSize,
    };
  }

  // ==========================================================================
  // ADMIN: GET PENDING MESSAGES
  // ==========================================================================
  async getPendingMessages(
    query: PendingMessageQueryDto,
  ): Promise<PendingMessagesResponseDto> {
    const { page = 1, pageSize = 50 } = query;

    const where: Prisma.MessageWhereInput = {
      status: MessageStatus.pending_approval,
    };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        senderName: publicName((m as any).sender),
        receiverId: m.receiverId,
        receiverName: publicName((m as any).receiver),
        originalContent: m.content,
        flaggedReason: m.flaggedReason || "Bilinmeyen",
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ==========================================================================
  // ADMIN: MODERATE MESSAGE
  // ==========================================================================
  async moderateMessage(
    messageId: string,
    adminId: string,
    action: "approve" | "reject",
  ): Promise<MessageResponseDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });

    if (!message) {
      throw new NotFoundException("Mesaj bulunamadı");
    }

    if (message.status !== MessageStatus.pending_approval) {
      throw new BadRequestException("Bu mesaj onay beklemiyordu");
    }

    const newStatus =
      action === "approve" ? MessageStatus.approved : MessageStatus.rejected;

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: newStatus,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });

    return this.mapMessageToDto(updatedMessage);
  }

  // ==========================================================================
  // HELPER: Map message to DTO
  // ==========================================================================
  private mapMessageToDto(message: any): MessageResponseDto {
    // Show filtered content if exists, otherwise original
    const content =
      message.status === MessageStatus.pending_approval
        ? "[Onay bekliyor]"
        : message.status === MessageStatus.rejected
          ? "[Mesaj reddedildi]"
          : message.filteredContent || message.content;

    return {
      id: message.id,
      threadId: message.threadId,
      senderId: message.senderId,
      senderName: publicName(message.sender),
      receiverId: message.receiverId,
      receiverName: publicName(message.receiver),
      content,
      status: message.status,
      flaggedReason: message.flaggedReason || undefined,
      readAt: message.readAt || undefined,
      createdAt: message.createdAt,
    };
  }

  // ==========================================================================
  // HELPER: Check daily message limit
  // ==========================================================================
  private async checkDailyMessageLimit(userId: string): Promise<void> {
    // Get daily message limit from platform settings
    const dailyLimitSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "daily_message_limit" },
    });
    const dailyLimit = dailyLimitSetting?.settingValue
      ? parseInt(dailyLimitSetting.settingValue, 10)
      : 50; // Default: 50

    // Get start of today (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Count messages sent today
    const messageCount = await this.prisma.message.count({
      where: {
        senderId: userId,
        createdAt: {
          gte: today,
        },
      },
    });

    if (messageCount >= dailyLimit) {
      this.logger.warn(
        `User ${userId} exceeded daily message limit (${messageCount}/${dailyLimit})`,
      );
      throw new BadRequestException(
        `Günlük mesaj limitinize (${dailyLimit}) ulaştınız. Yarın tekrar deneyin.`,
      );
    }
  }

  // ==========================================================================
  // Get remaining daily messages
  // ==========================================================================
  async getRemainingDailyMessages(
    userId: string,
  ): Promise<{ remaining: number; limit: number }> {
    // Get daily message limit from platform settings
    const dailyLimitSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "daily_message_limit" },
    });
    const dailyLimit = dailyLimitSetting?.settingValue
      ? parseInt(dailyLimitSetting.settingValue, 10)
      : 50; // Default: 50

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const messageCount = await this.prisma.message.count({
      where: {
        senderId: userId,
        createdAt: {
          gte: today,
        },
      },
    });

    return {
      remaining: Math.max(0, dailyLimit - messageCount),
      limit: dailyLimit,
    };
  }
}
