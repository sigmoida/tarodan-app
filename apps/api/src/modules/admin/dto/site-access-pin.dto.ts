import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

import { AdminListQueryDto } from "../../../common/list";

export class CreateSiteAccessPinDto {
  @ApiProperty({ example: "Ayşe Yılmaz", description: "Who this code is for" })
  @IsString()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional({ example: "ayse@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: "2026-08-31T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 10, description: "null/omitted = unlimited" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ description: "Send the invite email immediately" })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

export class UpdateSiteAccessPinDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ description: "Empty string clears the email" })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: "null clears the expiry" })
  @IsOptional()
  expiresAt?: string | null;

  @ApiPropertyOptional({ description: "null = unlimited" })
  @IsOptional()
  maxUses?: number | null;

  @ApiPropertyOptional({ description: "false = revoked" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SiteAccessPinQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ["all", "active", "revoked", "expired"] })
  @IsOptional()
  @IsIn(["all", "active", "revoked", "expired"])
  status?: "all" | "active" | "revoked" | "expired";
}
