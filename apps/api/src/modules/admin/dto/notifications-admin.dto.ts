import { IsString, IsBoolean, IsOptional, IsInt, IsArray, IsUUID, IsDateString, IsEnum, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// =============================================================================
// NOTIFICATION TEMPLATE DTOs
// =============================================================================

export class CreateNotificationTemplateDto {
    @ApiProperty({ description: 'Template key', example: 'order_shipped' })
    @IsString()
    @MaxLength(100)
    key: string;

    @ApiProperty({ description: 'Template name', example: 'Order Shipped Notification' })
    @IsString()
    @MaxLength(200)
    name: string;

    @ApiProperty({ description: 'Notification title with {{variables}}', example: 'Your order {{orderNumber}} has shipped!' })
    @IsString()
    @MaxLength(200)
    title: string;

    @ApiProperty({ description: 'Notification body with {{variables}}', example: 'Track your order at {{trackingUrl}}' })
    @IsString()
    body: string;

    @ApiPropertyOptional({ description: 'Available channels', example: ['push', 'email'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    channels?: string[];

    @ApiPropertyOptional({ description: 'Variable names for documentation', example: ['orderNumber', 'trackingUrl'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    variables?: string[];

    @ApiPropertyOptional({ description: 'Is active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateNotificationTemplateDto {
    @ApiPropertyOptional({ description: 'Template name' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @ApiPropertyOptional({ description: 'Notification title' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @ApiPropertyOptional({ description: 'Notification body' })
    @IsOptional()
    @IsString()
    body?: string;

    @ApiPropertyOptional({ description: 'Available channels' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    channels?: string[];

    @ApiPropertyOptional({ description: 'Variable names' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    variables?: string[];

    @ApiPropertyOptional({ description: 'Is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class NotificationTemplateResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    key: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    title: string;

    @ApiProperty()
    body: string;

    @ApiProperty()
    channels: string[];

    @ApiProperty()
    variables: string[];

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// =============================================================================
// SEND NOTIFICATION DTOs
// =============================================================================

export enum NotificationTargetType {
    ALL = 'all',
    SEGMENT = 'segment',
    USER_IDS = 'user_ids',
}

export class SendNotificationDto {
    @ApiProperty({ description: 'Notification title' })
    @IsString()
    @MaxLength(200)
    title: string;

    @ApiProperty({ description: 'Notification body' })
    @IsString()
    body: string;

    @ApiProperty({ description: 'Channels to send through', example: ['push', 'email'] })
    @IsArray()
    @IsString({ each: true })
    channels: string[];

    @ApiProperty({ description: 'Target type', enum: NotificationTargetType })
    @IsEnum(NotificationTargetType)
    targetType: NotificationTargetType;

    @ApiPropertyOptional({ description: 'User IDs (when targetType is user_ids)' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    userIds?: string[];

    @ApiPropertyOptional({ description: 'Segment filter criteria (when targetType is segment)' })
    @IsOptional()
    segmentCriteria?: {
        isSeller?: boolean;
        membershipTier?: string;
        registeredAfter?: string;
        registeredBefore?: string;
        hasOrders?: boolean;
    };

    @ApiPropertyOptional({ description: 'Additional data to include' })
    @IsOptional()
    data?: Record<string, any>;
}

// =============================================================================
// SCHEDULED NOTIFICATION DTOs
// =============================================================================

export class ScheduleNotificationDto {
    @ApiProperty({ description: 'Notification title' })
    @IsString()
    @MaxLength(200)
    title: string;

    @ApiProperty({ description: 'Notification body' })
    @IsString()
    body: string;

    @ApiProperty({ description: 'Channels to send through', example: ['push', 'email'] })
    @IsArray()
    @IsString({ each: true })
    channels: string[];

    @ApiProperty({ description: 'Target type', enum: NotificationTargetType })
    @IsEnum(NotificationTargetType)
    targetType: NotificationTargetType;

    @ApiPropertyOptional({ description: 'User IDs (when targetType is user_ids)' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    userIds?: string[];

    @ApiPropertyOptional({ description: 'Segment filter criteria' })
    @IsOptional()
    segmentCriteria?: Record<string, any>;

    @ApiProperty({ description: 'Scheduled time (ISO 8601)' })
    @IsDateString()
    scheduledFor: string;
}

export class UpdateScheduledNotificationDto {
    @ApiPropertyOptional({ description: 'Notification title' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    title?: string;

    @ApiPropertyOptional({ description: 'Notification body' })
    @IsOptional()
    @IsString()
    body?: string;

    @ApiPropertyOptional({ description: 'Channels to send through' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    channels?: string[];

    @ApiPropertyOptional({ description: 'Scheduled time (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    scheduledFor?: string;
}

export class ScheduledNotificationResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    title: string;

    @ApiProperty()
    body: string;

    @ApiProperty()
    channels: string[];

    @ApiProperty()
    targetType: string;

    @ApiPropertyOptional()
    targetData?: any;

    @ApiProperty()
    scheduledFor: Date;

    @ApiProperty()
    status: string;

    @ApiPropertyOptional()
    sentAt?: Date;

    @ApiProperty()
    sentCount: number;

    @ApiProperty()
    errorCount: number;

    @ApiProperty()
    createdBy: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// =============================================================================
// NOTIFICATION HISTORY DTOs
// =============================================================================

export class NotificationHistoryQueryDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number;

    @ApiPropertyOptional({ description: 'Page size', default: 20 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number;

    @ApiPropertyOptional({ description: 'Filter by channel (push, email, sms)' })
    @IsOptional()
    @IsString()
    channel?: string;

    @ApiPropertyOptional({ description: 'Filter by status (sent, failed, pending)' })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsOptional()
    @IsUUID()
    userId?: string;

    @ApiPropertyOptional({ description: 'Filter by notification type' })
    @IsOptional()
    @IsString()
    type?: string;

    @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

export class NotificationHistoryResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    userId: string;

    @ApiProperty()
    channel: string;

    @ApiProperty()
    type: string;

    @ApiProperty()
    title: string;

    @ApiProperty()
    body: string;

    @ApiPropertyOptional()
    data?: any;

    @ApiProperty()
    status: string;

    @ApiPropertyOptional()
    errorMessage?: string;

    @ApiPropertyOptional()
    sentAt?: Date;

    @ApiProperty()
    createdAt: Date;

    // Include user info
    @ApiPropertyOptional()
    user?: {
        id: string;
        displayName: string;
        email: string;
    };
}

// =============================================================================
// SCHEDULED NOTIFICATION QUERY DTO
// =============================================================================

export class ScheduledNotificationQueryDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    page?: number;

    @ApiPropertyOptional({ description: 'Page size', default: 20 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    limit?: number;

    @ApiPropertyOptional({ description: 'Filter by status (pending, sent, cancelled)' })
    @IsOptional()
    @IsString()
    status?: string;
}
