import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  UseGuards,
  Ip,
  Req,
} from '@nestjs/common';
import { SupportService } from './support.service';
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
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminRole, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ==========================================================================
  // PUBLIC ENDPOINTS (No Auth Required)
  // ==========================================================================

  /**
   * Guest contact form submission (Public)
   * POST /support/contact
   * Rate limited: 5 requests per hour per IP
   */
  @Post('contact')
  @Public()
  async guestContact(
    @Body() dto: GuestContactDto,
    @Ip() ip: string,
    @Req() req: any,
  ): Promise<GuestContactResponseDto> {
    // Get real IP from headers if behind proxy
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      ip ||
      'unknown';
    return this.supportService.createGuestContact(dto, clientIp);
  }

  // ==========================================================================
  // AUTHENTICATED ENDPOINTS
  // ==========================================================================

  /**
   * Create a support ticket
   * POST /support/tickets
   */
  @Post('tickets')
  async createTicket(
    @Request() req: any,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketResponseDto> {
    return this.supportService.createTicket(req.user.id, dto);
  }

  /**
   * Get my tickets
   * GET /support/tickets/me
   */
  @Get('tickets/me')
  async getMyTickets(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: TicketStatus,
  ): Promise<TicketListResponseDto> {
    return this.supportService.getUserTickets(req.user.id, page, pageSize, status);
  }

  /**
   * Get ticket by ID
   * GET /support/tickets/:id
   */
  @Get('tickets/:id')
  async getTicketById(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<TicketResponseDto> {
    const isAdmin = !!req.user.adminId;
    return this.supportService.getTicketById(id, req.user.id, isAdmin);
  }

  /**
   * Add message to ticket
   * POST /support/tickets/:id/messages
   */
  @Post('tickets/:id/messages')
  async addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AddTicketMessageDto,
  ): Promise<TicketResponseDto> {
    const isAdmin = !!req.user.adminId;
    return this.supportService.addMessage(id, req.user.id, dto, isAdmin);
  }

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * Get all tickets (Admin)
   * GET /support/admin/tickets
   */
  @Get('admin/tickets')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getAllTickets(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('assigneeId') assigneeId?: string,
  ): Promise<TicketListResponseDto> {
    return this.supportService.getAllTickets(
      page,
      pageSize,
      status,
      priority,
      category,
      assigneeId,
    );
  }

  /**
   * Get ticket by ID (Admin view with internal messages)
   * GET /support/admin/tickets/:id
   */
  @Get('admin/tickets/:id')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getTicketByIdAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<TicketResponseDto> {
    return this.supportService.getTicketById(id, req.user.id, true);
  }

  /**
   * Update ticket status (Admin)
   * PATCH /support/admin/tickets/:id/status
   */
  @Patch('admin/tickets/:id/status')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async updateTicketStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateTicketStatusDto,
  ): Promise<TicketResponseDto> {
    return this.supportService.updateTicketStatus(
      id,
      req.user.adminId || req.user.id,
      dto,
    );
  }

  /**
   * Assign ticket (Admin)
   * PATCH /support/admin/tickets/:id/assign
   */
  @Patch('admin/tickets/:id/assign')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async assignTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
  ): Promise<TicketResponseDto> {
    return this.supportService.assignTicket(id, dto);
  }

  /**
   * Update ticket priority (Admin)
   * PATCH /support/admin/tickets/:id/priority
   */
  @Patch('admin/tickets/:id/priority')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async updatePriority(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { priority: TicketPriority },
  ): Promise<TicketResponseDto> {
    return this.supportService.updatePriority(id, body.priority);
  }

  /**
   * Get ticket statistics (Admin)
   * GET /support/admin/stats
   */
  @Get('admin/stats')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getStats(): Promise<TicketStatsDto> {
    return this.supportService.getTicketStats();
  }

  /**
   * Get guest contact submissions (Admin)
   * GET /support/admin/guest-contacts
   */
  @Get('admin/guest-contacts')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getGuestContacts(): Promise<any[]> {
    return this.supportService.getGuestContacts();
  }
}
