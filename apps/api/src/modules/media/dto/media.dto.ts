import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsArray,
} from "class-validator";

export class UploadOptionsDto {
  @IsOptional()
  @IsString()
  bucket?: string;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsNumber()
  maxSize?: number;

  @IsOptional()
  @IsArray()
  allowedTypes?: string[];

  @IsOptional()
  @IsBoolean()
  generateThumbnail?: boolean;
}

export class ResizeOptionsDto {
  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsString()
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export class UploadResultDto {
  url: string;
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
}

export class DeleteFilesDto {
  @IsArray()
  @IsString({ each: true })
  keys: string[];
}

export class RotateProductImageDto {
  /**
   * Çevrilecek görselin DETAY anahtarı. Kart değil: kart 500×500 kırpılmış
   * olduğu için onu kaynak almak kadrajı ikinci kez daraltırdı.
   */
  @ApiProperty({
    example: "dev/products/product-images/temp/u/<userId>/<id>-detail.webp",
  })
  @IsString()
  @IsNotEmpty()
  detailKey: string;
}
