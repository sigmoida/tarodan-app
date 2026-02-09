import { IsOptional, IsString, IsNumber, IsDateString, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ErrorSeverity {
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical',
}

export enum SecurityEventType {
    FAILED_LOGIN = 'failed_login',
    IP_BLOCK = 'ip_block',
    SUSPICIOUS_ACTIVITY = 'suspicious_activity',
    PASSWORD_RESET = 'password_reset',
    TWO_FA_ENABLED = '2fa_enabled',
    ACCOUNT_LOCKED = 'account_locked',
}

export enum EmailStatus {
    QUEUED = 'queued',
    SENT = 'sent',
    DELIVERED = 'delivered',
    BOUNCED = 'bounced',
    FAILED = 'failed',
}

// ==================== ERROR LOGS ====================

export class ErrorLogQueryDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Items per page', default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: ErrorSeverity, description: 'Filter by severity' })
    @IsOptional()
    @IsString()
    severity?: string;

    @ApiPropertyOptional({ description: 'Filter by source (api, worker, scheduler)' })
    @IsOptional()
    @IsString()
    source?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ description: 'Start date filter' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date filter' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Search in message' })
    @IsOptional()
    @IsString()
    search?: string;
}

// ==================== SECURITY LOGS ====================

export class SecurityLogQueryDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Items per page', default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: SecurityEventType, description: 'Filter by event type' })
    @IsOptional()
    @IsString()
    eventType?: string;

    @ApiPropertyOptional({ description: 'Filter by severity' })
    @IsOptional()
    @IsString()
    severity?: string;

    @ApiPropertyOptional({ description: 'Filter by IP address' })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ description: 'Filter by resolved status' })
    @IsOptional()
    @Type(() => Boolean)
    resolved?: boolean;

    @ApiPropertyOptional({ description: 'Start date filter' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date filter' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Search in email or details' })
    @IsOptional()
    @IsString()
    search?: string;
}

export class ResolveSecurityIssueDto {
    @ApiPropertyOptional({ description: 'Resolution notes' })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class BlockIpDto {
    @ApiPropertyOptional({ description: 'IP address to block' })
    @IsString()
    ipAddress: string;

    @ApiPropertyOptional({ description: 'Reason for blocking' })
    @IsOptional()
    @IsString()
    reason?: string;
}

// ==================== EMAIL LOGS ====================

export class EmailLogQueryDto {
    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Items per page', default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: EmailStatus, description: 'Filter by status' })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional({ description: 'Filter by template name' })
    @IsOptional()
    @IsString()
    template?: string;

    @ApiPropertyOptional({ description: 'Filter by recipient email' })
    @IsOptional()
    @IsString()
    to?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiPropertyOptional({ description: 'Start date filter' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date filter' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Search in subject or recipient' })
    @IsOptional()
    @IsString()
    search?: string;
}
