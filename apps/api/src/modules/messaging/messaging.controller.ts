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
  Logger,
  UnauthorizedException,
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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AdminRole } from '@prisma/client';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('messages')
@RequirePermission('messages')
export class MessagingController {
  private readonly logger = new Logger(MessagingController.name);

  constructor(
    private readonly messagingService: MessagingService,
    private readonly contentFilterService: ContentFilterService,
  ) {}

  private getUserId(req: any): string {
    const userId = req?.user?.id;
    if (!userId) {
      this.logger.warn('messages: req.user.id missing');
      throw new UnauthorizedException('Oturum gerekli');
    }
    return userId;
  }

  /**
   * Create a new thread or get existing one
   * POST /messages/threads
   */
  @Post('threads')
  async createThread(
    @Request() req: any,
    @Body() dto: CreateThreadDto,
  ): Promise<MessageThreadResponseDto> {
    return this.messagingService.createThread(this.getUserId(req), dto);
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
    try {
      return await this.messagingService.getUserThreads(this.getUserId(req), query);
    } catch (e: any) {
      this.logger.error(`messages/threads failed: ${e?.message}`, e?.stack);
      throw e;
    }
  }

  /**
   * Toplam okunmamış mesaj sayısı (tüm thread'ler) — header rozeti için.
   * GET /messages/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any): Promise<{ count: number }> {
    try {
      const count = await this.messagingService.getUnreadMessageCount(this.getUserId(req));
      return { count };
    } catch (e: any) {
      this.logger.error(`messages/unread-count failed: ${e?.message}`, e?.stack);
      throw e;
    }
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
    return this.messagingService.getThreadById(id, this.getUserId(req));
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
    return this.messagingService.getThreadMessages(id, this.getUserId(req), query);
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
    return this.messagingService.sendMessage(id, this.getUserId(req), dto);
  }

  /**
   * Get remaining daily messages
   * GET /messages/daily-limit
   */
  @Get('daily-limit')
  async getDailyLimit(@Request() req: any) {
    return this.messagingService.getRemainingDailyMessages(this.getUserId(req));
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
      this.getUserId(req),
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
