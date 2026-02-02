
import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
    @ApiProperty({ description: 'Category name' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Category description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Parent category ID' })
    @IsOptional()
    @IsUUID()
    parentId?: string;

    @ApiPropertyOptional({ description: 'Sort order', default: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @ApiPropertyOptional({ description: 'Is category active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateCategoryDto {
    @ApiPropertyOptional({ description: 'Category name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Category description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Parent category ID' })
    @IsOptional()
    @IsUUID()
    parentId?: string;

    @ApiPropertyOptional({ description: 'Sort order' })
    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @ApiPropertyOptional({ description: 'Is category active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
