import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Validate,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SafeNotificationLinkData } from "../../notification/dto";

/**
 * Yönetici bildirim yayını.
 *
 * Uç, satır içi bir TypeScript tipi kullanıyordu; TypeScript tipleri
 * ÇALIŞMA ZAMANINDA yoktur, bu yüzden `data.link` hiçbir doğrulamadan
 * geçmiyordu. Yayın binlerce kullanıcıya gittiği için serbest link burada
 * denetlenmeli.
 */
export class AdminSendNotificationDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  channels: string[];

  @ApiProperty({ enum: ["all", "segment", "user_ids"] })
  @IsIn(["all", "segment", "user_ids"])
  targetType: "all" | "segment" | "user_ids";

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  userIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  segmentCriteria?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "Bildirim verisi. `link` alanı yalnız https ya da izinli site-içi yol olabilir.",
  })
  @IsOptional()
  @IsObject()
  @Validate(SafeNotificationLinkData)
  data?: Record<string, unknown>;
}
