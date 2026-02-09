import { IsOptional, IsString, IsNumber, Min, Max, IsBoolean, IsArray, IsUUID, IsHexColor, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

// =============================================================================
// Query DTOs
// =============================================================================

export class AdminTagQueryDto {
    @ApiPropertyOptional({ example: 'vintage' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @Transform(({ value }) => value === 'true' || value === true)
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ example: 20 })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    @Min(1)
    @Max(100)
    limit?: number;

    @ApiPropertyOptional({ example: 'usageCount', enum: ['name', 'usageCount', 'createdAt'] })
    @IsOptional()
    @IsString()
    sortBy?: 'name' | 'usageCount' | 'createdAt';

    @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// Create/Update DTOs
// =============================================================================

export class CreateTagDto {
    @ApiProperty({ example: 'Vintage' })
    @IsString()
    @MinLength(1)
    name: string;

    @ApiPropertyOptional({ example: 'Products from the 1980s and earlier' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: '#FF5733' })
    @IsOptional()
    @IsHexColor()
    color?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateTagDto {
    @ApiPropertyOptional({ example: 'Vintage Models' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    name?: string;

    @ApiPropertyOptional({ example: 'Updated description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: '#33FF57' })
    @IsOptional()
    @IsHexColor()
    color?: string;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class MergeTagsDto {
    @ApiProperty({ example: ['uuid-tag-1', 'uuid-tag-2'], description: 'Tag IDs to merge (will be deleted)' })
    @IsArray()
    @IsUUID('4', { each: true })
    sourceTagIds: string[];

    @ApiProperty({ example: 'uuid-target-tag', description: 'Target tag ID (will receive all products)' })
    @IsUUID()
    targetTagId: string;
}

export class BulkAssignTagsDto {
    @ApiProperty({ example: ['uuid-product-1', 'uuid-product-2'] })
    @IsArray()
    @IsUUID('4', { each: true })
    productIds: string[];

    @ApiProperty({ example: ['uuid-tag-1', 'uuid-tag-2'] })
    @IsArray()
    @IsUUID('4', { each: true })
    tagIds: string[];
}

export class BulkRemoveTagsDto {
    @ApiProperty({ example: ['uuid-product-1', 'uuid-product-2'] })
    @IsArray()
    @IsUUID('4', { each: true })
    productIds: string[];

    @ApiProperty({ example: ['uuid-tag-1', 'uuid-tag-2'] })
    @IsArray()
    @IsUUID('4', { each: true })
    tagIds: string[];
}

// =============================================================================
// Response DTOs
// =============================================================================

export class TagResponseDto {
    id: string;
    name: string;
    slug: string;
    description?: string;
    color?: string;
    isActive: boolean;
    usageCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export class TagListResponseDto {
    data: TagResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class MergeTagsResponseDto {
    success: boolean;
    message: string;
    mergedCount: number;
    targetTag: TagResponseDto;
}

export class BulkAssignResponseDto {
    success: boolean;
    message: string;
    assignedCount: number;
}
