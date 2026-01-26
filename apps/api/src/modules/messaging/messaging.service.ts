import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { ContentFilterService } from './content-filter.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { MessageStatus, Prisma } from '@prisma/client';
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
} from './dto';

// Daily message limit
const DAILY_MESSAGE_LIMIT = 50;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentFilterService: ContentFilterService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

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
      throw new BadRequestException('Alıcı kullanıcı ID gereklidir (recipientId veya participantId)');
    }

    // Cannot message yourself
    if (senderId === recipientId) {
      throw new BadRequestException('Kendinize mesaj gönderemezsiniz');
    }

    // Verify recipient exists
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new NotFoundException('Alıcı kullanıcı bulunamadı');
    }

    // Verify product if provided
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı');
      }
    }

    // Normalize participant IDs (always store smaller ID first)
    const [participant1Id, participant2Id] = [senderId, recipientId].sort();

    // Check if thread already exists
    let thread = await this.prisma.messageThread.findFirst({
      where: {
        participant1Id,
        participant2Id,
        productId: dto.productId || null,
      },
    });

    if (thread) {
      // Thread exists, send message if provided
      if (dto.message) {
        await this.sendMessage(thread.id, senderId, { content: dto.message });
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

    // Send first message if provided
    if (dto.message) {
      await this.sendMessage(thread.id, senderId, { content: dto.message });
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
    // Check daily message limit
    await this.checkDailyMessageLimit(senderId);

    // Get thread and verify sender is participant
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Mesaj konusu bulunamadı');
    }

    if (thread.participant1Id !== senderId && thread.participant2Id !== senderId) {
      throw new ForbiddenException('Bu konuya mesaj gönderme yetkiniz yok');
    }

    // Determine receiver
    const receiverId = thread.participant1Id === senderId
      ? thread.participant2Id
      : thread.participant1Id;

    // Apply content filtering
    const filterResult = await this.contentFilterService.moderateWithAI(dto.content);

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
        content: dto.content,
        filteredContent: filterResult.isClean ? null : filterResult.filteredContent,
        status,
        flaggedReason: filterResult.flaggedReason,
      },
      include: {
        sender: { select: { id: true, displayName: true } },
        receiver: { select: { id: true, displayName: true } },
      },
    });

    // Update thread last message time
    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    // Send notification to receiver about new message
    if (status === MessageStatus.sent) {
      try {
        // Get short preview of message (first 50 chars)
        const messagePreview = dto.content.length > 50
          ? dto.content.substring(0, 50) + '...'
          : dto.content;

        await this.notificationService.createInAppNotification(
          receiverId,
          NotificationType.NEW_MESSAGE,
          {
            threadId,
            senderName: message.sender?.displayName || 'Bir kullanıcı',
            messagePreview,
          },
        );
      } catch (error) {
        this.logger.error('Failed to send message notification:', error);
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
      OR: [
        { participant1Id: userId },
        { participant2Id: userId },
      ],
    };

    const [threads, total] = await Promise.all([
      this.prisma.messageThread.findMany({
        where,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              sender: { select: { id: true, displayName: true } },
              receiver: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.messageThread.count({ where }),
    ]);

    // Get participant info and unread counts
    const threadDtos: MessageThreadResponseDto[] = await Promise.all(
      threads.map(async (thread) => {
        const [participant1, participant2, product, unreadCount] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: thread.participant1Id },
            select: { id: true, displayName: true },
          }),
          this.prisma.user.findUnique({
            where: { id: thread.participant2Id },
            select: { id: true, displayName: true },
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
          participant1Name: participant1?.displayName || '',
          participant2Id: thread.participant2Id,
          participant2Name: participant2?.displayName || '',
          productId: thread.productId || undefined,
          productTitle: product?.title,
          productImage: product?.images?.[0]?.url,
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
      throw new NotFoundException('Mesaj konusu bulunamadı');
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      throw new ForbiddenException('Bu konuyu görüntüleme yetkiniz yok');
    }

    const [participant1, participant2, product, lastMessage, unreadCount] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: thread.participant1Id },
          select: { id: true, displayName: true },
        }),
        this.prisma.user.findUnique({
          where: { id: thread.participant2Id },
          select: { id: true, displayName: true },
        }),
        thread.productId
          ? this.prisma.product.findUnique({
              where: { id: thread.productId },
              select: { id: true, title: true, images: { take: 1 } },
            })
          : null,
        this.prisma.message.findFirst({
          where: { threadId },
          orderBy: { createdAt: 'desc' },
          include: {
            sender: { select: { id: true, displayName: true } },
            receiver: { select: { id: true, displayName: true } },
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
      participant1Name: participant1?.displayName || '',
      participant2Id: thread.participant2Id,
      participant2Name: participant2?.displayName || '',
      productId: thread.productId || undefined,
      productTitle: product?.title,
      productImage: product?.images?.[0]?.url,
      lastMessage: lastMessage
        ? this.mapMessageToDto(lastMessage)
        : undefined,
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
    const { page = 1, pageSize = 50 } = query;

    // Verify access
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw new NotFoundException('Mesaj konusu bulunamadı');
    }

    if (thread.participant1Id !== userId && thread.participant2Id !== userId) {
      throw new ForbiddenException('Bu konuyu görüntüleme yetkiniz yok');
    }

    const where: Prisma.MessageWhereInput = {
      threadId,
      status: { in: [MessageStatus.sent, MessageStatus.approved] },
    };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, displayName: true } },
          receiver: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.message.count({ where }),
    ]);

    // Mark messages as read
    await this.prisma.message.updateMany({
      where: {
        threadId,
        receiverId: userId,
        readAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
      },
      data: { readAt: new Date() },
    });

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
          sender: { select: { id: true, displayName: true } },
          receiver: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: 'asc' },
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
        senderName: (m as any).sender?.displayName || '',
        receiverId: m.receiverId,
        receiverName: (m as any).receiver?.displayName || '',
        originalContent: m.content,
        flaggedReason: m.flaggedReason || 'Bilinmeyen',
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
    action: 'approve' | 'reject',
  ): Promise<MessageResponseDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, displayName: true } },
        receiver: { select: { id: true, displayName: true } },
      },
    });

    if (!message) {
      throw new NotFoundException('Mesaj bulunamadı');
    }

    if (message.status !== MessageStatus.pending_approval) {
      throw new BadRequestException('Bu mesaj onay beklemiyordu');
    }

    const newStatus =
      action === 'approve' ? MessageStatus.approved : MessageStatus.rejected;

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: newStatus,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, displayName: true } },
        receiver: { select: { id: true, displayName: true } },
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
        ? '[Onay bekliyor]'
        : message.status === MessageStatus.rejected
          ? '[Mesaj reddedildi]'
          : message.filteredContent || message.content;

    return {
      id: message.id,
      threadId: message.threadId,
      senderId: message.senderId,
      senderName: message.sender?.displayName || '',
      receiverId: message.receiverId,
      receiverName: message.receiver?.displayName || '',
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

    if (messageCount >= DAILY_MESSAGE_LIMIT) {
      this.logger.warn(`User ${userId} exceeded daily message limit (${messageCount}/${DAILY_MESSAGE_LIMIT})`);
      throw new BadRequestException(
        `Günlük mesaj limitinize (${DAILY_MESSAGE_LIMIT}) ulaştınız. Yarın tekrar deneyin.`
      );
    }
  }

  // ==========================================================================
  // Get remaining daily messages
  // ==========================================================================
  async getRemainingDailyMessages(userId: string): Promise<{ remaining: number; limit: number }> {
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
      remaining: Math.max(0, DAILY_MESSAGE_LIMIT - messageCount),
      limit: DAILY_MESSAGE_LIMIT,
    };
  }
}
