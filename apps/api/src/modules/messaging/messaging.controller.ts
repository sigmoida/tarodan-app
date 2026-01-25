import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { ContentFilterService, ContentFilterRule } from './content-filter.service';
import {
  CreateThreadDto,
  SendMessageDto,
  MessageModerateDto,
  ThreadQueryDto,
  MessageQueryDto,
  PendingMessageQueryDto,
  MessageThreadResponseDto,
  MessageResponseDto,
  ThreadListResponseDto,
  MessageListResponseDto,
  PendingMessagesResponseDto,
} from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { AdminRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('messages')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly contentFilterService: ContentFilterService,
  ) {}

  /**
   * Create a new thread or get existing one
   * POST /messages/threads
   */
  @Post('threads')
  async createThread(
    @Request() req: any,
    @Body() dto: CreateThreadDto,
  ): Promise<MessageThreadResponseDto> {
    return this.messagingService.createThread(req.user.id, dto);
  }

  /**
   * Get user's message threads
   * GET /messages/threads
   */
  @Get('threads')
  async getThreads(
    @Request() req: any,
    @Query() query: ThreadQueryDto,
  ): Promise<ThreadListResponseDto> {
    return this.messagingService.getUserThreads(req.user.id, query);
  }

  /**
   * Get a specific thread
   * GET /messages/threads/:id
   */
  @Get('threads/:id')
  async getThread(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageThreadResponseDto> {
    return this.messagingService.getThreadById(id, req.user.id);
  }

  /**
   * Get messages in a thread
   * GET /messages/threads/:id/messages
   */
  @Get('threads/:id/messages')
  async getThreadMessages(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessageQueryDto,
  ): Promise<MessageListResponseDto> {
    return this.messagingService.getThreadMessages(id, req.user.id, query);
  }

  /**
   * Send a message in a thread
   * POST /messages/threads/:id/messages
   */
  @Post('threads/:id/messages')
  async sendMessage(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messagingService.sendMessage(id, req.user.id, dto);
  }

  /**
   * Get remaining daily messages
   * GET /messages/daily-limit
   */
  @Get('daily-limit')
  async getDailyLimit(@Request() req: any) {
    return this.messagingService.getRemainingDailyMessages(req.user.id);
  }

  // ==========================================================================
  // ADMIN ENDPOINTS
  // ==========================================================================

  /**
   * Get pending messages for moderation (Admin)
   * GET /messages/admin/pending
   */
  @Get('admin/pending')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async getPendingMessages(
    @Query() query: PendingMessageQueryDto,
  ): Promise<PendingMessagesResponseDto> {
    return this.messagingService.getPendingMessages(query);
  }

  /**
   * Approve or reject a message (Admin)
   * POST /messages/admin/:id/moderate
   */
  @Post('admin/:id/moderate')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin, AdminRole.moderator)
  async moderateMessage(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageModerateDto,
  ): Promise<MessageResponseDto> {
    return this.messagingService.moderateMessage(
      id,
      req.user.id,
      dto.action,
    );
  }

  /**
   * Get all content filters (Admin)
   * GET /messages/admin/filters
   */
  @Get('admin/filters')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async getFilters(): Promise<ContentFilterRule[]> {
    return this.contentFilterService.getAllFilters();
  }

  /**
   * Test a filter pattern (Admin)
   * POST /messages/admin/filters/test
   */
  @Post('admin/filters/test')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async testFilter(
    @Body() body: { pattern: string; testContent: string },
  ) {
    const result = this.contentFilterService.testPattern(
      body.pattern,
      body.testContent,
    );
    return { matches: result };
  }
}
