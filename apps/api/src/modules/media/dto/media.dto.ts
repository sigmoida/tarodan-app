import {
  IsOptional,
  IsString,
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
