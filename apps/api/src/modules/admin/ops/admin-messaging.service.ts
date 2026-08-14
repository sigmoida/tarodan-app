import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { Prisma, MessageStatus } from "@prisma/client";
import { AdminMessageQueryDto } from "../dto";
import { paginate, resolveOrderBy } from "../../../common/list";
import { i18nMessage } from "../../i18n";

/**
 * Mesaj moderasyonu admin operasyonları (liste/detay, onay/ret/geri alma) —
 * AdminService'in MESSAGE MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  // ==================== MESSAGE MANAGEMENT ====================

  /**
   * Get messages for admin moderation
   */
  async getMessages(query: AdminMessageQueryDto) {
    const { status, fromDate, toDate, search } = query;

    const where: Prisma.MessageWhereInput = {};

    // Only filter by status when explicitly provided (e.g. "Tümü" = no status = all messages)
    if (status != null) {
      where.status = status;
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

    // Mesaj içeriği veya gönderen/alıcı ad/e-posta araması (case-insensitive).
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const normalized = trimmedSearch.toLowerCase();
      where.OR = [
        { content: { contains: trimmedSearch, mode: "insensitive" } },
        { filteredContent: { contains: trimmedSearch, mode: "insensitive" } },
        { flaggedReason: { contains: trimmedSearch, mode: "insensitive" } },
        {
          sender: {
            displayName: { contains: trimmedSearch, mode: "insensitive" },
          },
        },
        { sender: { email: { contains: trimmedSearch, mode: "insensitive" } } },
        {
          receiver: {
            displayName: { contains: trimmedSearch, mode: "insensitive" },
          },
        },
        {
          receiver: { email: { contains: trimmedSearch, mode: "insensitive" } },
        },
      ];
      if (Object.values(MessageStatus).includes(normalized as MessageStatus))
        where.OR.push({ status: normalized as MessageStatus });
    }

    const orderBy = resolveOrderBy<Prisma.MessageOrderByWithRelationInput>(
      "Message",
      query,
      { defaultSort: { createdAt: "desc" } },
    );

    return paginate(
      this.prisma.message,
      {
        where,
        include: {
          sender: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
          thread: { select: { id: true } },
        },
        orderBy,
      },
      query,
    );
  }

  /**
   * Get message by ID for admin
   */
  async getMessageById(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        receiver: {
          select: {
            id: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        thread: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 50, // Last 50 messages in thread
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException(
        i18nMessage("server.messaging.messageNotFound"),
      );
    }

    return message;
  }

  /**
   * Approve message
   */
  async approveMessage(adminId: string, messageId: string, notes?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(
        i18nMessage("server.messaging.messageNotFound"),
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.approved,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "message_approve",
      "Message",
      messageId,
      message,
      { notes },
    );

    return { success: true, messageId, status: "approved" };
  }

  async rejectMessage(adminId: string, messageId: string, reason?: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(
        i18nMessage("server.messaging.messageNotFound"),
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.rejected,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "message_reject",
      "Message",
      messageId,
      message,
      { reason },
    );

    return { success: true, messageId, status: "rejected", reason };
  }

  async revertMessage(adminId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(
        i18nMessage("server.messaging.messageNotFound"),
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.pending_approval,
        reviewedById: null,
        reviewedAt: null,
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "message_revert",
      "Message",
      messageId,
      message,
      {},
    );

    return { success: true, messageId, status: "pending_approval" };
  }
}
