import { IsString, IsEnum, IsUUID, IsOptional, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportType {
  PRODUCT = 'product',
  USER = 'user',
  COLLECTION = 'collection',
  MESSAGE = 'message',
}

export enum ReportReason {
  SPAM = 'spam',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  FAKE_PRODUCT = 'fake_product',
  SCAM = 'scam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  COUNTERFEIT = 'counterfeit',
  WRONG_CATEGORY = 'wrong_category',
  MISLEADING_INFO = 'misleading_info',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportType, description: 'Type of content being reported' })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiProperty({ description: 'ID of the content being reported (product, user, collection, or message)' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: ReportReason, description: 'Reason for the report' })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ description: 'Additional details about the report' })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Açıklama en az 10 karakter olmalıdır' })
  @MaxLength(1000, { message: 'Açıklama en fazla 1000 karakter olabilir' })
  description?: string;
}

export class ReportResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ReportType })
  type: ReportType;

  @ApiProperty()
  targetId: string;

  @ApiProperty({ enum: ReportReason })
  reason: ReportReason;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  resolvedAt?: Date;

  @ApiPropertyOptional()
  adminNote?: string;
}

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiPropertyOptional({ description: 'Admin note about the resolution' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
