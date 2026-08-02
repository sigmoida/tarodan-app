import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  bodyHtml?: string;

  @ApiPropertyOptional({ description: "JSON array of variable names" })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  variablesJson?: string;
}

export class PreviewEmailTemplateDto {
  @ApiPropertyOptional({ description: "Sample data for variable substitution" })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Override HTML body (draft preview, not saved)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  overrideHtml?: string;

  @ApiPropertyOptional({
    description: "Override subject (draft preview, not saved)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  overrideSubject?: string;
}

export class SendTestEmailDto {
  @ApiProperty({ example: "test@example.com" })
  @IsEmail()
  to: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;

  @ApiPropertyOptional({ description: "Unsaved HTML body for draft testing" })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  overrideHtml?: string;

  @ApiPropertyOptional({ description: "Unsaved subject for draft testing" })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  overrideSubject?: string;
}
