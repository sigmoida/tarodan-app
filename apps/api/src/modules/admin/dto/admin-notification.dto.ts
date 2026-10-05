import {
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  BROADCAST_EMAIL_HTML_MAX,
  BROADCAST_EMAIL_SUBJECT_MAX,
  MAILING_TYPES,
  type MailingType,
} from "@tarodan/types";
import { SafeNotificationLinkData } from "../../notification/dto";

/** E-posta kanalına özel alanlar — gönderim, zamanlama ve önizleme ortak kullanır. */
export class BroadcastEmailContentDto {
  @ApiPropertyOptional({
    description: "E-posta konusu; boşsa push başlığı kullanılır.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(BROADCAST_EMAIL_SUBJECT_MAX)
  emailSubject?: string;

  @ApiPropertyOptional({
    description:
      "E-posta HTML gövdesi. Sunucuda süzülür (script/olay işleyicisi atılır) ve ortak mail iskeleti içinde gönderilir. Verilmezse eski düz metin e-posta gider.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(BROADCAST_EMAIL_HTML_MAX)
  emailHtml?: string;

  @ApiPropertyOptional({
    enum: MAILING_TYPES,
    default: "announcement",
    description:
      "announcement: herkese (varsayılan). marketing: yalnız pazarlama izni olanlara, çıkış linkiyle.",
  })
  @IsOptional()
  @IsIn(MAILING_TYPES)
  mailingType?: MailingType;
}

/**
 * Yönetici bildirim yayını.
 *
 * Uç, satır içi bir TypeScript tipi kullanıyordu; TypeScript tipleri
 * ÇALIŞMA ZAMANINDA yoktur, bu yüzden `data.link` hiçbir doğrulamadan
 * geçmiyordu. Yayın binlerce kullanıcıya gittiği için serbest link burada
 * denetlenmeli.
 */
export class AdminSendNotificationDto extends BroadcastEmailContentDto {
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

/** Zamanlanmış yayın: gönderimle aynı içerik + gelecekteki zaman (ISO). */
export class AdminScheduleNotificationDto extends AdminSendNotificationDto {
  @ApiProperty({ description: "ISO tarih-saat; gelecekte olmalı" })
  @IsDateString()
  scheduledFor: string;
}

/** E-posta önizlemesi: gerçekte gidecek (süzülmüş + iskeletli) HTML'i döner. */
export class PreviewBroadcastEmailDto extends BroadcastEmailContentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(65)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(240)
  body: string;
}

/** Kitle sayacı: seçili hedef kaç kullanıcıya / kaç pazarlama alıcısına ulaşır. */
export class AudienceCountDto {
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
}

/** E-posta kanalına özel alanlar — gönderim, zamanlama ve önizleme ortak kullanır. */
export class BroadcastEmailContentDto {
  @ApiPropertyOptional({
    description: "E-posta konusu; boşsa push başlığı kullanılır.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(BROADCAST_EMAIL_SUBJECT_MAX)
  emailSubject?: string;

  @ApiPropertyOptional({
    description:
      "E-posta HTML gövdesi. Sunucuda süzülür (script/olay işleyicisi atılır) ve ortak mail iskeleti içinde gönderilir. Verilmezse eski düz metin e-posta gider.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(BROADCAST_EMAIL_HTML_MAX)
  emailHtml?: string;

  @ApiPropertyOptional({
    enum: MAILING_TYPES,
    default: "announcement",
    description:
      "announcement: herkese (varsayılan). marketing: yalnız pazarlama izni olanlara, çıkış linkiyle.",
  })
  @IsOptional()
  @IsIn(MAILING_TYPES)
  mailingType?: MailingType;
}

export class AdminSendNotificationDto extends BroadcastEmailContentDto {
