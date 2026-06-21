import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @ApiPropertyOptional({ description: 'JSON array of variable names' })
  @IsOptional()
  @IsString()
  variablesJson?: string;
}

export class PreviewEmailTemplateDto {
  @ApiPropertyOptional({ description: 'Sample data for variable substitution' })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Override HTML body (draft preview, not saved)' })
  @IsOptional()
  @IsString()
  overrideHtml?: string;

  @ApiPropertyOptional({ description: 'Override subject (draft preview, not saved)' })
  @IsOptional()
  @IsString()
  overrideSubject?: string;
}

export class SendTestEmailDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsString()
  to: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;
}
