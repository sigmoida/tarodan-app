import { IsString, IsOptional, IsBoolean, IsInt, IsDateString, Min, IsEnum, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// IAB Standard Ad Sizes
export const IAB_STANDARD_SIZES = [
  { name: 'Leaderboard', width: 728, height: 90 },
  { name: 'Medium Rectangle', width: 300, height: 250 },
  { name: 'Wide Skyscraper', width: 160, height: 600 },
  { name: 'Half Page', width: 300, height: 600 },
  { name: 'Billboard', width: 970, height: 250 },
  { name: 'Mobile Leaderboard', width: 320, height: 50 },
  { name: 'Mobile Banner', width: 320, height: 100 },
  { name: 'Large Mobile Banner', width: 320, height: 480 },
  { name: 'Square', width: 250, height: 250 },
  { name: 'Small Square', width: 200, height: 200 },
] as const;

export enum AdPosition {
  header = 'header',
  sidebar = 'sidebar',
  footer = 'footer',
  inline = 'inline',
  popup = 'popup',
}

export enum AdDeviceType {
  desktop = 'desktop',
  mobile = 'mobile',
  all = 'all',
}

export class CreateAdvertisementDto {
  @ApiProperty({ description: 'Ad title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Link URL (click destination)' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'HTML or plain text content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Alt text for accessibility' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ description: 'Image width in pixels' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  width?: number;

  @ApiPropertyOptional({ description: 'Image height in pixels' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  height?: number;

  @ApiPropertyOptional({ 
    description: 'Position: header, sidebar, footer, inline, popup', 
    enum: AdPosition,
    default: AdPosition.header 
  })
  @IsOptional()
  @IsEnum(AdPosition)
  position?: AdPosition = AdPosition.header;

  @ApiPropertyOptional({ 
    description: 'Device type: desktop, mobile, all', 
    enum: AdDeviceType,
    default: AdDeviceType.all 
  })
  @IsOptional()
  @IsEnum(AdDeviceType)
  deviceType?: AdDeviceType = AdDeviceType.all;

  @ApiPropertyOptional({ description: 'Display order (lower = first)', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @ApiPropertyOptional({ description: 'Is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Start date (ISO)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
