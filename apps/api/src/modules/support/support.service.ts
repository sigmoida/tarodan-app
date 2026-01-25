import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  Prisma,
} from '@prisma/client';
import {
  CreateTicketDto,
  AddTicketMessageDto,
  UpdateTicketStatusDto,
  AssignTicketDto,
  TicketResponseDto,
  TicketListResponseDto,
  TicketStatsDto,
  GuestContactDto,
  GuestContactResponseDto,
} from './dto';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ==========================================================================
  // GENERATE TICKET NUMBER
  // ==========================================================================
  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  // ==========================================================================
  // GUEST CONTACT FORM (Public - No Auth Required)
  // ==========================================================================
  async createGuestContact(
    dto: GuestContactDto,
    clientIp: string,
  ): Promise<GuestContactResponseDto> {
    // Rate limit check: 5 requests per hour per IP
    const rateLimitKey = `guest_contact:${clientIp}`;
    const rateLimit = await this.cacheService.checkRateLimit(
      rateLimitKey,
      5, // max 5 requests
      3600, // per hour (3600 seconds)
    );

    if (!rateLimit.allowed) {
      const waitMinutes = Math.ceil(
        (rateLimit.resetAt.getTime() - Date.now()) / 60000,
      );
      throw new BadRequestException(
        `Çok fazla istek gönderdiniz. Lütfen ${waitMinutes} dakika sonra tekrar deneyin.`,
      );
    }

    try {
      // Generate a reference number for the guest contact
      const referenceNumber = this.generateTicketNumber().replace('TKT', 'GC');
      
      // Store guest contact in Redis with 30 day TTL
      const guestContactData = {
        referenceNumber,
        name: dto.name,
        email: dto.email,
        subject: dto.subject || 'İletişim Formu',
        message: dto.message,
        clientIp,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      // Store in Redis for admin review
      const contactKey = `guest_contact:submission:${referenceNumber}`;
      await this.cacheService.set(contactKey, guestContactData, {
        ttl: 30 * 24 * 3600, // 30 days
      });

      // Add to guest contacts list
      const listKey = 'guest_contacts:list';
      const existingList = await this.cacheService.get<string[]>(listKey) || [];
      existingList.unshift(referenceNumber);
      // Keep only last 1000 entries
      const trimmedList = existingList.slice(0, 1000);
      await this.cacheService.set(listKey, trimmedList, {
        ttl: 30 * 24 * 3600, // 30 days
      });

      this.logger.log(
        `Guest contact form submitted: ${referenceNumber} from ${dto.email}`,
      );

      // TODO: Send email notification to admin

      return {
        success: true,
        message:
          'Mesajınız başarıyla alındı. En kısa sürede size dönüş yapacağız.',
        ticketNumber: referenceNumber,
      };
    } catch (error) {
      this.logger.error('Guest contact form error:', error);
      throw new BadRequestException(
        'Mesajınız gönderilemedi. Lütfen daha sonra tekrar deneyin.',
      );
    }
  }

  // ==========================================================================
  // ADMIN: GET GUEST CONTACTS
  // ==========================================================================
  async getGuestContacts(): Promise<any[]> {
    const listKey = 'guest_contacts:list';
    const referenceNumbers = await this.cacheService.get<string[]>(listKey) || [];
    
    const contacts = [];
    for (const refNum of referenceNumbers.slice(0, 100)) {
      const contactKey = `guest_contact:submission:${refNum}`;
      const contact = await this.cacheService.get(contactKey);
      if (contact) {
        contacts.push(contact);
      }
    }
    
    return contacts;
  }

  // ==========================================================================
  // CREATE TICKET
  // ==========================================================================
  async createTicket(
    userId: string,
    dto: CreateTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber: this.generateTicketNumber(),
        creatorId: userId,
        category: dto.category,
        priority: TicketPriority.medium,
        status: TicketStatus.open,
        subject: dto.subject,
        orderId: dto.orderId,
        tradeId: dto.tradeId,
      },
    });

    // Add first message
    await this.prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: userId,
        content: dto.message,
        attachments: dto.attachments || [],
        isInternal: false,
      },
    });

    return this.getTicketById(ticket.id, userId);
  }

  // ==========================================================================
  // GET TICKET BY ID
  // ==========================================================================
  async getTicketById(
    ticketId: string,
    userId: string,
    isAdmin = false,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        creator: { select: { id: true, displayName: true } },
        assignee: { select: { id: true, displayName: true } },
        messages: {
          include: {
            sender: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'asc' },
          // Hide internal messages from non-admins
          where: isAdmin ? {} : { isInternal: false },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    // Only creator or admin can view
    if (!isAdmin && ticket.creatorId !== userId) {
      throw new ForbiddenException('Bu talebi görüntüleme yetkiniz yok');
    }

    return this.mapTicketToDto(ticket);
  }

  // ==========================================================================
  // GET USER'S TICKETS
  // ==========================================================================
  async getUserTickets(
    userId: string,
    page?: number,
    pageSize?: number,
    status?: TicketStatus,
  ): Promise<TicketListResponseDto> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    const where: Prisma.SupportTicketWhereInput = {
      creatorId: userId,
      ...(status && { status }),
    };

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true } },
          assignee: { select: { id: true, displayName: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.mapTicketToDto(t)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // ADD MESSAGE TO TICKET
  // ==========================================================================
  async addMessage(
    ticketId: string,
    userId: string,
    dto: AddTicketMessageDto,
    isAdmin = false,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    // Only creator or admin can add messages
    if (!isAdmin && ticket.creatorId !== userId) {
      throw new ForbiddenException('Bu talebe mesaj ekleme yetkiniz yok');
    }

    // Closed tickets cannot receive messages
    if (ticket.status === TicketStatus.closed) {
      throw new BadRequestException('Kapatılmış taleplere mesaj eklenemez');
    }

    // Create message
    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: userId,
        content: dto.content,
        attachments: dto.attachments || [],
        isInternal: isAdmin && dto.isInternal ? true : false,
      },
    });

    // Update ticket status based on who replied
    const newStatus = isAdmin
      ? TicketStatus.waiting_customer
      : TicketStatus.in_progress;

    if (ticket.status !== TicketStatus.resolved && (ticket.status as string) !== 'closed') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: newStatus },
      });
    }

    return this.getTicketById(ticketId, userId, isAdmin);
  }

  // ==========================================================================
  // ADMIN: GET ALL TICKETS
  // ==========================================================================
  async getAllTickets(
    page?: number,
    pageSize?: number,
    status?: TicketStatus,
    priority?: TicketPriority,
    category?: TicketCategory,
    assigneeId?: string,
  ): Promise<TicketListResponseDto> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    const where: Prisma.SupportTicketWhereInput = {
      ...(status && { status }),
      ...(priority && { priority }),
      ...(category && { category }),
      ...(assigneeId && { assigneeId }),
    };

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true } },
          assignee: { select: { id: true, displayName: true } },
          _count: { select: { messages: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.mapTicketToDto(t)),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // ADMIN: UPDATE TICKET STATUS
  // ==========================================================================
  async updateTicketStatus(
    ticketId: string,
    adminId: string,
    dto: UpdateTicketStatusDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    const updateData: Prisma.SupportTicketUpdateInput = {
      status: dto.status,
    };

    if (dto.status === TicketStatus.resolved && !ticket.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    if (dto.status === TicketStatus.closed && !ticket.closedAt) {
      updateData.closedAt = new Date();
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    // Add internal note if provided
    if (dto.note) {
      await this.prisma.ticketMessage.create({
        data: {
          ticketId,
          senderId: adminId,
          content: `[Durum değişikliği: ${dto.status}] ${dto.note}`,
          isInternal: true,
          attachments: [],
        },
      });
    }

    return this.getTicketById(ticketId, adminId, true);
  }

  // ==========================================================================
  // ADMIN: ASSIGN TICKET
  // ==========================================================================
  async assignTicket(
    ticketId: string,
    dto: AssignTicketDto,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assigneeId: dto.assigneeId },
    });

    return this.getTicketById(ticketId, dto.assigneeId, true);
  }

  // ==========================================================================
  // ADMIN: UPDATE PRIORITY
  // ==========================================================================
  async updatePriority(
    ticketId: string,
    priority: TicketPriority,
  ): Promise<TicketResponseDto> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Destek talebi bulunamadı');
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { priority },
    });

    return this.getTicketById(ticketId, ticket.creatorId, true);
  }

  // ==========================================================================
  // ADMIN: GET TICKET STATS
  // ==========================================================================
  async getTicketStats(): Promise<TicketStatsDto> {
    const [
      total,
      open,
      inProgress,
      waitingCustomer,
      resolved,
      closed,
      resolvedTickets,
    ] = await Promise.all([
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.open } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.in_progress } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.waiting_customer } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.resolved } }),
      this.prisma.supportTicket.count({ where: { status: TicketStatus.closed } }),
      this.prisma.supportTicket.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    // Calculate average resolution time
    let avgResolutionTimeHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, ticket) => {
        const diff =
          (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()) /
          (1000 * 60 * 60);
        return sum + diff;
      }, 0);
      avgResolutionTimeHours = Math.round(totalHours / resolvedTickets.length);
    }

    return {
      total,
      open,
      inProgress,
      waitingCustomer,
      resolved,
      closed,
      avgResolutionTimeHours,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private mapTicketToDto(ticket: any): TicketResponseDto {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      creatorId: ticket.creatorId,
      creatorName: ticket.creator?.displayName || '',
      assigneeId: ticket.assigneeId || undefined,
      assigneeName: ticket.assignee?.displayName || undefined,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      subject: ticket.subject,
      orderId: ticket.orderId || undefined,
      tradeId: ticket.tradeId || undefined,
      messages: ticket.messages?.map((m: any) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender?.displayName || '',
        content: m.content,
        isInternal: m.isInternal,
        attachments: m.attachments,
        createdAt: m.createdAt,
      })),
      messageCount: ticket._count?.messages ?? ticket.messages?.length ?? 0,
      resolvedAt: ticket.resolvedAt || undefined,
      closedAt: ticket.closedAt || undefined,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
