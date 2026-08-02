import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  Prisma,
} from "@prisma/client";
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
  AdminTicketQueryDto,
} from "./dto";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { paginate, resolveOrderBy } from "../../common/list";
import { REFERENCE_PREFIX } from "../../common/helpers/code-prefixes";
import {
  generateReferenceCode,
  generateUniqueReference,
} from "../../common/helpers/generate-reference";

/**
 * #291: sortable fields for the cache-backed guest-contacts list and their sort
 * type. This is the one endpoint without a Prisma model, so the sortable set is
 * declared here (mirroring the stored object) instead of derived from the DMMF.
 */
const GUEST_CONTACT_SORT_FIELDS: Record<string, "text" | "date"> = {
  referenceNumber: "text",
  name: "text",
  email: "text",
  subject: "text",
  status: "text",
  createdAt: "date",
};

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationService: NotificationService,
  ) {}

  // ==========================================================================
  // GENERATE TICKET NUMBER
  // ==========================================================================
  private generateTicketNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.supportTicket,
      async (code) =>
        (await this.prisma.supportTicket.count({
          where: { ticketNumber: code },
        })) > 0,
    );
  }

  /**
   * Misafir (üye olmayan) iletişim formu referansı. Redis'te tutulduğu için
   * DB'de tekillik kontrolü yapılamaz; 30^10 uzayında çakışma ihmal edilebilir.
   */
  private generateGuestContactReference(): string {
    return generateReferenceCode(REFERENCE_PREFIX.guestContact);
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
      const referenceNumber = this.generateGuestContactReference();

      // Store guest contact in Redis with 30 day TTL
      const guestContactData = {
        referenceNumber,
        name: dto.name,
        email: dto.email,
        subject: dto.subject || "İletişim Formu",
        message: dto.message,
        clientIp,
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      // Store in Redis for admin review
      const contactKey = `guest_contact:submission:${referenceNumber}`;
      await this.cacheService.set(contactKey, guestContactData, {
        ttl: 30 * 24 * 3600, // 30 days
      });

      // Add to guest contacts list
      const listKey = "guest_contacts:list";
      const existingList =
        (await this.cacheService.get<string[]>(listKey)) || [];
      existingList.unshift(referenceNumber);
      // Keep only last 1000 entries
      const trimmedList = existingList.slice(0, 1000);
      await this.cacheService.set(listKey, trimmedList, {
        ttl: 30 * 24 * 3600, // 30 days
      });

      this.logger.log(
        `Guest contact form submitted: ${referenceNumber} from ${dto.email}`,
      );

      // Destek ekibine bildirim maili (fire-and-forget): mail hatası mesajın
      // kaydını bozmamalı — mesaj zaten Redis'e yazıldı ve panelde görünüyor.
      this.notificationService
        .sendGuestContactAdminEmail({
          referenceNumber,
          name: dto.name,
          email: dto.email,
          subject: guestContactData.subject,
          message: dto.message,
        })
        .catch((err) =>
          this.logger.error(
            `Guest contact bildirim maili gönderilemedi (${referenceNumber}): ${err?.message ?? err}`,
          ),
        );

      return {
        success: true,
        message:
          "Mesajınız başarıyla alındı. En kısa sürede size dönüş yapacağız.",
        ticketNumber: referenceNumber,
      };
    } catch (error) {
      this.logger.error("Guest contact form error:", error);
      throw new BadRequestException(
        "Mesajınız gönderilemedi. Lütfen daha sonra tekrar deneyin.",
      );
    }
  }

  // ==========================================================================
  // ADMIN: GET GUEST CONTACTS
  // ==========================================================================
  /**
   * #101 faz-2: server pagination for the cache-backed guest-contacts list.
   *
   * The store is Redis (a `guest_contacts:list` array of reference numbers, one
   * `guest_contact:submission:<ref>` object each), not Prisma — so there is no DB
   * query to paginate/search. Two paths:
   * - **No search:** slice the reference list by page/limit and hydrate ONLY the
   *   current page's objects. This is the real win — it replaces the old
   *   fetch-first-100-then-slice-client-side with true server pagination.
   * - **Search:** the searchable fields (name/email/subject) live inside the
   *   objects, not the reference key, so we hydrate the list and filter in-memory,
   *   then paginate. Bounded by the guest-contact volume (contact-form submissions).
   * - **Explicit sort:** #291 — there is no DB `orderBy` to route through
   *   `resolveOrderBy`, so we sort the hydrated list in-memory before slicing.
   *   Sorting (like search) forfeits the hydrate-only-current-page win because it
   *   needs the whole list; the default (unsorted) path keeps that win. The
   *   reference list is already stored newest-first, so the default order matches
   *   a `createdAt desc` sort without any hydration.
   */
  async getGuestContacts(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { page = 1, limit = 20, search, sortBy, sortOrder } = params ?? {};
    const listKey = "guest_contacts:list";
    const referenceNumbers =
      (await this.cacheService.get<string[]>(listKey)) || [];

    const hydrate = (refs: string[]) =>
      Promise.all(
        refs.map((refNum) =>
          this.cacheService.get<any>(`guest_contact:submission:${refNum}`),
        ),
      ).then((list) => list.filter(Boolean) as any[]);

    const meta = (total: number) => ({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });

    // A sort is honored only for known fields; an unknown `sortBy` falls back to
    // the default order (never throws), mirroring the DMMF-backed endpoints.
    const sortField =
      sortBy && GUEST_CONTACT_SORT_FIELDS[sortBy] ? sortBy : null;

    if (search || sortField) {
      const q = search?.toLowerCase();
      const all = await hydrate(referenceNumbers);
      const filtered = q
        ? all.filter((c) =>
            [c?.referenceNumber, c?.name, c?.email, c?.subject].some((f) =>
              String(f ?? "")
                .toLowerCase()
                .includes(q),
            ),
          )
        : all;
      const ordered = sortField
        ? this.sortGuestContacts(filtered, sortField, sortOrder ?? "desc")
        : filtered;
      const start = (page - 1) * limit;
      return {
        data: ordered.slice(start, start + limit),
        meta: meta(filtered.length),
      };
    }

    const start = (page - 1) * limit;
    const pageRefs = referenceNumbers.slice(start, start + limit);
    const data = await hydrate(pageRefs);
    return { data, meta: meta(referenceNumbers.length) };
  }

  /**
   * #291: type-aware in-memory sort for the cache-backed guest-contacts list.
   * `createdAt` sorts chronologically; every other field sorts alphabetically
   * (locale-aware). Nullish values always sink to the bottom regardless of
   * direction, matching the `nulls: "last"` behavior of the DB-backed tables.
   */
  private sortGuestContacts(
    list: any[],
    sortBy: string,
    sortOrder: "asc" | "desc",
  ): any[] {
    const dir = sortOrder === "asc" ? 1 : -1;
    const isDate = GUEST_CONTACT_SORT_FIELDS[sortBy] === "date";
    return [...list].sort((a, b) => {
      const av = a?.[sortBy];
      const bv = b?.[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = isDate
        ? new Date(av).getTime() - new Date(bv).getTime()
        : String(av).localeCompare(String(bv), "tr", { sensitivity: "base" });
      return cmp * dir;
    });
  }

  // ==========================================================================
  // CREATE TICKET
  // ==========================================================================
  async createTicket(
    userId: string,
    dto: CreateTicketDto,
  ): Promise<TicketResponseDto> {
    const ticketNumber = await this.generateTicketNumber();
    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        creatorId: userId,
        category: dto.category,
        priority: dto.priority ?? TicketPriority.medium,
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
          orderBy: { createdAt: "asc" },
          // Hide internal messages from non-admins
          where: isAdmin ? {} : { isInternal: false },
        },
        _count: { select: { messages: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Destek talebi bulunamadı");
    }

    // Only creator or admin can view
    if (!isAdmin && ticket.creatorId !== userId) {
      throw new ForbiddenException("Bu talebi görüntüleme yetkiniz yok");
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
          creator: { select: { id: true, displayName: true, email: true } },
          assignee: { select: { id: true, displayName: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: "desc" },
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
      throw new NotFoundException("Destek talebi bulunamadı");
    }

    // Only creator or admin can add messages
    if (!isAdmin && ticket.creatorId !== userId) {
      throw new ForbiddenException("Bu talebe mesaj ekleme yetkiniz yok");
    }

    // Closed tickets cannot receive messages
    if (ticket.status === TicketStatus.closed) {
      throw new BadRequestException("Kapatılmış taleplere mesaj eklenemez");
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

    if (
      ticket.status !== TicketStatus.resolved &&
      (ticket.status as string) !== "closed"
    ) {
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
  async getAllTickets(query: AdminTicketQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.category && { category: query.category }),
      ...(query.assigneeId && { assigneeId: query.assigneeId }),
    };

    const search = query.search?.trim();
    if (search) {
      const normalized = search.toLowerCase();
      where.OR = [
        { ticketNumber: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { creator: { displayName: { contains: search, mode: "insensitive" } } },
        { creator: { email: { contains: search, mode: "insensitive" } } },
      ];
      if (Object.values(TicketCategory).includes(normalized as TicketCategory))
        where.OR.push({ category: normalized as TicketCategory });
      if (Object.values(TicketPriority).includes(normalized as TicketPriority))
        where.OR.push({ priority: normalized as TicketPriority });
      if (Object.values(TicketStatus).includes(normalized as TicketStatus))
        where.OR.push({ status: normalized as TicketStatus });
    }

    const orderBy = resolveOrderBy<
      | Prisma.SupportTicketOrderByWithRelationInput
      | Prisma.SupportTicketOrderByWithRelationInput[]
    >("SupportTicket", query, {
      defaultSort: [{ createdAt: "desc" }, { priority: "desc" }],
      sortMap: {
        creatorName: (direction) => ({ creator: { displayName: direction } }),
      },
    });
    const result = await paginate(
      this.prisma.supportTicket,
      {
        where,
        include: {
          creator: { select: { id: true, displayName: true } },
          assignee: { select: { id: true, displayName: true } },
          _count: { select: { messages: true } },
        },
        orderBy,
      },
      query,
    );

    return {
      ...result,
      data: result.data.map((ticket) => this.mapTicketToDto(ticket)),
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
      throw new NotFoundException("Destek talebi bulunamadı");
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
      throw new NotFoundException("Destek talebi bulunamadı");
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
      throw new NotFoundException("Destek talebi bulunamadı");
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
      this.prisma.supportTicket.count({
        where: { status: TicketStatus.in_progress },
      }),
      this.prisma.supportTicket.count({
        where: { status: TicketStatus.waiting_customer },
      }),
      this.prisma.supportTicket.count({
        where: { status: TicketStatus.resolved },
      }),
      this.prisma.supportTicket.count({
        where: { status: TicketStatus.closed },
      }),
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
      creatorName: ticket.creator?.displayName || "",
      creatorEmail: ticket.creator?.email || undefined,
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
        senderName: m.sender?.displayName || "",
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
