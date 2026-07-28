/**
 * Notification Controller
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Provides REST endpoints for notification management
 */
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RegisterPushTokenDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminRole } from '@prisma/client';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ==========================================================================
  // PUSH TOKEN MANAGEMENT
  // ==========================================================================

  /**
   * POST /notifications/push-token - Register push token
   * Requirement: Push notifications (project.md)
   */
  @Post('push-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register device push token for notifications' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Push token registered',
  })
  async registerPushToken(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.notificationService.registerPushToken(userId, dto);
  }

  // ==========================================================================
  // IN-APP NOTIFICATIONS
  // ==========================================================================

  /**
   * GET /notifications - Get user's in-app notifications
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user in-app notifications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of notifications',
  })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationService.getInAppNotifications(userId, page, limit);
  }

  /**
   * GET /notifications/unread-count - Get unread notification count
   */
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unread count',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    },
  })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.getUnreadCount(userId);
    return { count };
  }

  /**
   * PATCH /notifications/:id/read - Mark notification as read
   */
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Notification marked as read',
  })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    const success = await this.notificationService.markAsRead(notificationId, userId);
    return { success };
  }

  /**
   * POST /notifications/mark-all-read - Mark all notifications as read
   */
  @Post('mark-all-read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationService.markAllAsRead(userId);
    return { success: true };
  }

  // ==========================================================================
  // ADMIN: PROVIDER STATUS
  // ==========================================================================

  /**
   * GET /notifications/admin/provider-status - Get notification provider status
   * Admin only endpoint
  */
  @Get('admin/provider-status')
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(AdminRole.admin, AdminRole.super_admin)
  @RequirePermission('notifications')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notification provider status (Admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Provider configuration status',
    schema: {
      type: 'object',
      properties: {
        sendgrid: { type: 'boolean', description: 'SendGrid configured' },
        expo: { type: 'boolean', description: 'Expo Push configured' },
        sms: { type: 'boolean', description: 'Twilio SMS configured' },
      },
    },
  })
  async getProviderStatus() {
    return this.notificationService.getProviderStatus();
  }
}
