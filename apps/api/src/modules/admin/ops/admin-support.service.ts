import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "./admin-audit.service";
import { TicketStatus, TicketPriority, TicketCategory } from "@prisma/client";
import { SupportService } from "../../support/support.service";
import { i18nMessage } from "../../i18n";

/**
 * Destek talebi admin operasyonları (liste/detay, güncelleme, yanıt) —
 * AdminService'in SUPPORT TICKET MANAGEMENT bölümünden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly supportService: SupportService,
  ) {}

  // ==================== SUPPORT TICKET MANAGEMENT ====================

  /**
   * Get support tickets with filters for admin
   */
  async getSupportTickets(query: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assigneeId?: string;
    creatorId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      status,
      priority,
      category,
      assigneeId,
      creatorId,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = query;

    // Use SupportService's getAllTickets method
    const result = await this.supportService.getAllTickets({
      page,
      limit,
      status,
      priority,
      category,
      assigneeId,
    });

    // Filter by creatorId and date range if provided
    let filteredTickets = result.data;

    if (creatorId) {
      filteredTickets = filteredTickets.filter(
        (t) => t.creatorId === creatorId,
      );
    }

    if (fromDate || toDate) {
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      filteredTickets = filteredTickets.filter((t) => {
        const createdAt = new Date(t.createdAt);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      });
    }

    return {
      data: filteredTickets,
      meta: {
        total: filteredTickets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredTickets.length / limit),
      },
    };
  }

  /**
   * Get support ticket by ID for admin
   */
  async getSupportTicketById(ticketId: string) {
    // Use SupportService's getTicketById with admin flag
    // Pass empty string for userId since admin can view any ticket
    return this.supportService.getTicketById(ticketId, "", true);
  }

  /**
   * Update support ticket
   */
  async updateSupportTicket(
    adminId: string,
    ticketId: string,
    dto: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
      note?: string;
    },
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(i18nMessage("server.support.ticketNotFound"));
    }

    const oldTicket = { ...ticket };

    // Update status if provided
    if (dto.status) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: dto.status,
        note: dto.note,
      });
    }

    // Update priority if provided
    if (dto.priority) {
      await this.supportService.updatePriority(ticketId, dto.priority);
    }

    // Update assignee if provided
    if (dto.assigneeId !== undefined) {
      await this.supportService.assignTicket(ticketId, {
        assigneeId: dto.assigneeId,
      });
    }

    const updatedTicket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "support_ticket_update",
      "SupportTicket",
      ticketId,
      oldTicket,
      updatedTicket,
    );

    return this.getSupportTicketById(ticketId);
  }

  /**
   * Reply to support ticket
   */
  async replyToSupportTicket(
    adminId: string,
    ticketId: string,
    message: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(i18nMessage("server.support.ticketNotFound"));
    }

    // Use SupportService's addMessage with admin flag
    await this.supportService.addMessage(
      ticketId,
      adminId,
      { content: message },
      true,
    );

    // Update status to in_progress if it was waiting_customer
    if (ticket.status === TicketStatus.waiting_customer) {
      await this.supportService.updateTicketStatus(ticketId, adminId, {
        status: TicketStatus.in_progress,
      });
    }

    // Create audit log
    await this.audit.createAuditLog(
      adminId,
      "support_ticket_reply",
      "SupportTicket",
      ticketId,
      ticket,
      {
        ...ticket,
        message,
      },
    );

    return this.getSupportTicketById(ticketId);
  }
}
