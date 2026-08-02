import { IsString, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdatePlatformSettingDto {
  @ApiProperty({
    example: "site_maintenance",
    description: "Setting key",
  })
  @IsString()
  key: string;

  @ApiProperty({
    example: "false",
    description: "Setting value",
  })
  @IsString()
  value: string;

  @ApiPropertyOptional({
    example: "string",
    description: "Setting type (string, boolean, number, json)",
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    example: "Site bakım modu",
    description: "Setting description",
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PlatformSettingResponseDto {
  @ApiProperty({ example: "uuid" })
  id: string;

  @ApiProperty({ example: "site_maintenance" })
  key: string;

  @ApiProperty({ example: "false" })
  value: string;

  @ApiPropertyOptional({ example: "Site bakım modu" })
  description?: string;

  @ApiProperty({ example: "2024-01-15T10:30:00.000Z" })
  updatedAt: Date;
}

export class UpdateWarehouseAddressDto {
  @ApiPropertyOptional({ example: "Tarodan Deposu" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: "Tarodan Lojistik" })
  @IsString()
  fullName: string;

  @ApiProperty({ example: "+905000000000" })
  @IsString()
  phone: string;

  @ApiProperty({ example: "İstanbul" })
  @IsString()
  city: string;

  @ApiProperty({ example: "Kadıköy" })
  @IsString()
  district: string;

  @ApiProperty({ example: "Hasanpaşa Mah. Örnek Sok. No:1" })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: "34722" })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class BulkSettingsUpdateDto {
  @ApiProperty({
    type: [UpdatePlatformSettingDto],
    description: "Array of settings to update",
  })
  settings: UpdatePlatformSettingDto[];
}
