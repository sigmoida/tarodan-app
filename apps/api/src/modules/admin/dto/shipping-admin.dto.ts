import { IsString, IsBoolean, IsOptional, IsInt, IsArray, IsNumber, IsUUID, IsDateString, Min, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// =============================================================================
// SHIPPING METHOD DTOs
// =============================================================================

export class CreateShippingMethodDto {
    @ApiProperty({ description: 'Method name', example: 'Express Delivery' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ description: 'Unique code', example: 'express' })
    @IsString()
    @MaxLength(50)
    code: string;

    @ApiPropertyOptional({ description: 'Description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Is active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Sort order', default: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

export class UpdateShippingMethodDto {
    @ApiPropertyOptional({ description: 'Method name' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ description: 'Unique code' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    code?: string;

    @ApiPropertyOptional({ description: 'Description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Sort order' })
    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}

export class ShippingMethodResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    code: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    sortOrder: number;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// =============================================================================
// SHIPPING CARRIER DTOs
// =============================================================================

export class CreateShippingCarrierDto {
    @ApiProperty({ description: 'Carrier name', example: 'Aras Kargo' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ description: 'Unique code', example: 'aras' })
    @IsString()
    @MaxLength(50)
    code: string;

    @ApiPropertyOptional({ description: 'Logo URL' })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiPropertyOptional({ description: 'Tracking URL template with {{tracking}} placeholder' })
    @IsOptional()
    @IsString()
    trackingUrl?: string;

    @ApiPropertyOptional({ description: 'API endpoint URL' })
    @IsOptional()
    @IsString()
    apiEndpoint?: string;

    @ApiPropertyOptional({ description: 'API key' })
    @IsOptional()
    @IsString()
    apiKey?: string;

    @ApiPropertyOptional({ description: 'API secret' })
    @IsOptional()
    @IsString()
    apiSecret?: string;

    @ApiPropertyOptional({ description: 'Is active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Supports label generation', default: true })
    @IsOptional()
    @IsBoolean()
    supportsLabels?: boolean;
}

export class UpdateShippingCarrierDto {
    @ApiPropertyOptional({ description: 'Carrier name' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ description: 'Unique code' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    code?: string;

    @ApiPropertyOptional({ description: 'Logo URL' })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiPropertyOptional({ description: 'Tracking URL template' })
    @IsOptional()
    @IsString()
    trackingUrl?: string;

    @ApiPropertyOptional({ description: 'API endpoint URL' })
    @IsOptional()
    @IsString()
    apiEndpoint?: string;

    @ApiPropertyOptional({ description: 'API key' })
    @IsOptional()
    @IsString()
    apiKey?: string;

    @ApiPropertyOptional({ description: 'API secret' })
    @IsOptional()
    @IsString()
    apiSecret?: string;

    @ApiPropertyOptional({ description: 'Is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Supports label generation' })
    @IsOptional()
    @IsBoolean()
    supportsLabels?: boolean;
}

export class ShippingCarrierResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    code: string;

    @ApiPropertyOptional()
    logo?: string;

    @ApiPropertyOptional()
    trackingUrl?: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    supportsLabels: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// =============================================================================
// SHIPPING ZONE DTOs
// =============================================================================

export class CreateShippingZoneDto {
    @ApiProperty({ description: 'Zone name', example: 'Türkiye' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ description: 'Description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'ISO country codes', example: ['TR', 'CY'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    countries?: string[];

    @ApiPropertyOptional({ description: 'Region/state codes', example: ['34', '35'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    regions?: string[];

    @ApiPropertyOptional({ description: 'City names', example: ['Istanbul', 'Ankara'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    cities?: string[];

    @ApiPropertyOptional({ description: 'Is default zone', default: false })
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @ApiPropertyOptional({ description: 'Is active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateShippingZoneDto {
    @ApiPropertyOptional({ description: 'Zone name' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ description: 'Description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'ISO country codes' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    countries?: string[];

    @ApiPropertyOptional({ description: 'Region/state codes' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    regions?: string[];

    @ApiPropertyOptional({ description: 'City names' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    cities?: string[];

    @ApiPropertyOptional({ description: 'Is default zone' })
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @ApiPropertyOptional({ description: 'Is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class ShippingZoneResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiProperty()
    countries: string[];

    @ApiProperty()
    regions: string[];

    @ApiProperty()
    cities: string[];

    @ApiProperty()
    isDefault: boolean;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

// =============================================================================
// SHIPPING RATE DTOs
// =============================================================================

export class CreateShippingRateDto {
    @ApiProperty({ description: 'Zone ID' })
    @IsUUID()
    zoneId: string;

    @ApiProperty({ description: 'Method ID' })
    @IsUUID()
    methodId: string;

    @ApiProperty({ description: 'Carrier ID' })
    @IsUUID()
    carrierId: string;

    @ApiProperty({ description: 'Base price', example: 25.00 })
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    basePrice: number;

    @ApiPropertyOptional({ description: 'Price per kg', default: 0 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    pricePerKg?: number;

    @ApiPropertyOptional({ description: 'Minimum order amount for free shipping' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    freeShippingMin?: number;

    @ApiProperty({ description: 'Minimum delivery days', example: 1 })
    @IsInt()
    @Min(0)
    minDeliveryDays: number;

    @ApiProperty({ description: 'Maximum delivery days', example: 3 })
    @IsInt()
    @Min(0)
    maxDeliveryDays: number;

    @ApiPropertyOptional({ description: 'Is active', default: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateShippingRateDto {
    @ApiPropertyOptional({ description: 'Zone ID' })
    @IsOptional()
    @IsUUID()
    zoneId?: string;

    @ApiPropertyOptional({ description: 'Method ID' })
    @IsOptional()
    @IsUUID()
    methodId?: string;

    @ApiPropertyOptional({ description: 'Carrier ID' })
    @IsOptional()
    @IsUUID()
    carrierId?: string;

    @ApiPropertyOptional({ description: 'Base price' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    basePrice?: number;

    @ApiPropertyOptional({ description: 'Price per kg' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    pricePerKg?: number;

    @ApiPropertyOptional({ description: 'Minimum order amount for free shipping' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    freeShippingMin?: number;

    @ApiPropertyOptional({ description: 'Minimum delivery days' })
    @IsOptional()
    @IsInt()
    @Min(0)
    minDeliveryDays?: number;

    @ApiPropertyOptional({ description: 'Maximum delivery days' })
    @IsOptional()
    @IsInt()
    @Min(0)
    maxDeliveryDays?: number;

    @ApiPropertyOptional({ description: 'Is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class ShippingRateResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    zoneId: string;

    @ApiProperty()
    methodId: string;

    @ApiProperty()
    carrierId: string;

    @ApiProperty()
    basePrice: number;

    @ApiProperty()
    pricePerKg: number;

    @ApiPropertyOptional()
    freeShippingMin?: number;

    @ApiProperty()
    minDeliveryDays: number;

    @ApiProperty()
    maxDeliveryDays: number;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;

    // Include related data
    @ApiPropertyOptional()
    zone?: ShippingZoneResponseDto;

    @ApiPropertyOptional()
    method?: ShippingMethodResponseDto;

    @ApiPropertyOptional()
    carrier?: ShippingCarrierResponseDto;
}

// =============================================================================
// SHIPPING LABEL DTOs
// =============================================================================

export class GenerateLabelDto {
    @ApiProperty({ description: 'Shipment ID' })
    @IsUUID()
    shipmentId: string;
}

export class BulkGenerateLabelsDto {
    @ApiProperty({ description: 'Array of shipment IDs' })
    @IsArray()
    @IsUUID('4', { each: true })
    shipmentIds: string[];
}

export class ShippingLabelResponseDto {
    @ApiProperty()
    shipmentId: string;

    @ApiProperty()
    labelUrl: string;

    @ApiPropertyOptional()
    trackingNumber?: string;

    @ApiProperty()
    carrier: string;

    @ApiProperty()
    generatedAt: Date;
}

// =============================================================================
// QUERY DTOs
// =============================================================================

export class ShippingMethodQueryDto {
    @ApiPropertyOptional({ description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Search term' })
    @IsOptional()
    @IsString()
    search?: string;
}

export class ShippingZoneQueryDto {
    @ApiPropertyOptional({ description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Filter by country code' })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiPropertyOptional({ description: 'Search term' })
    @IsOptional()
    @IsString()
    search?: string;
}

export class ShippingCarrierQueryDto {
    @ApiPropertyOptional({ description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Filter by label support' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    supportsLabels?: boolean;

    @ApiPropertyOptional({ description: 'Search term' })
    @IsOptional()
    @IsString()
    search?: string;
}

export class ShippingRateQueryDto {
    @ApiPropertyOptional({ description: 'Filter by zone ID' })
    @IsOptional()
    @IsUUID()
    zoneId?: string;

    @ApiPropertyOptional({ description: 'Filter by method ID' })
    @IsOptional()
    @IsUUID()
    methodId?: string;

    @ApiPropertyOptional({ description: 'Filter by carrier ID' })
    @IsOptional()
    @IsUUID()
    carrierId?: string;

    @ApiPropertyOptional({ description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;
}
