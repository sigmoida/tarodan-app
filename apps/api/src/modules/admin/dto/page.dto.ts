import { IsString, IsOptional, IsBoolean, IsNumber, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export class CreateStaticPageDto {
  @ApiProperty({ example: 'about' })
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'Slug sadece küçük harf, rakam ve tire içerebilir (örn: about, faq)' })
  slug: string;

  @ApiProperty({ example: 'Hakkımızda' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'HTML content' })
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStaticPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'Slug sadece küçük harf, rakam ve tire içerebilir' })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
