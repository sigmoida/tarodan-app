import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsHexColor,
  MinLength,
  IsUUID,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import { AdminListQueryDto } from "../../../common/list";

// =============================================================================
// Query DTOs
// =============================================================================

export class AdminAttributeGroupQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "scale" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class AdminAttributeQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "uuid-group-id" })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ example: "1:18" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// Attribute Group DTOs
// =============================================================================

export class CreateAttributeGroupDto {
  @ApiProperty({ example: "Scale" })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: "Model scale ratio (1:18, 1:24, etc.)" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateAttributeGroupDto {
  @ApiPropertyOptional({ example: "Scale Ratio" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: "Updated description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

// =============================================================================
// Attribute DTOs
// =============================================================================

export class CreateAttributeDto {
  @ApiProperty({ example: "uuid-group-id" })
  @IsUUID()
  groupId: string;

  @ApiProperty({ example: "1:18" })
  @IsString()
  @MinLength(1)
  value: string;

  @ApiPropertyOptional({ example: "1/18 Scale" })
  @IsOptional()
  @IsString()
  displayValue?: string;

  @ApiPropertyOptional({
    example: "#FF0000",
    description: "Swatch hex kodu; null gönderilirse renk temizlenir.",
  })
  @IsOptional()
  @IsHexColor()
  color?: string | null;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAttributeDto {
  @ApiPropertyOptional({ example: "1:18 Scale" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string;

  @ApiPropertyOptional({ example: "1/18 Scale (Large)" })
  @IsOptional()
  @IsString()
  displayValue?: string;

  @ApiPropertyOptional({
    example: "#00FF00",
    description: "Swatch hex kodu; null gönderilirse renk temizlenir.",
  })
  @IsOptional()
  @IsHexColor()
  color?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// Response DTOs
// =============================================================================

export class AttributeResponseDto {
  id: string;
  groupId: string;
  value: string;
  slug: string;
  displayValue?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  usageCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AttributeGroupResponseDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  attributeCount: number;
  attributes?: AttributeResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class AttributeGroupListResponseDto {
  data: AttributeGroupResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AttributeListResponseDto {
  data: AttributeResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
