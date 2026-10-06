import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  MAIL_DELIVERY_MODES,
  type MailAreaUpdate,
  type MailDeliveryMode,
  type MailInternalEventId,
  type MailSenderAccountInput,
} from "@tarodan/types";
import {
  MAIL_INTERNAL_EVENT_IDS,
  MAX_INTERNAL_RECIPIENTS,
  MAX_MAIL_DISPLAY_NAME_LENGTH,
} from "../../mail/helpers/mail-area-settings";

/**
 * Mail Yönlendirme admin uçlarının girdileri. Şekil burada; iş kuralları
 * (normalizasyon, tekillik, alanın olayı mı, kullanımda mı) servislerdedir —
 * servis doğrudan çağrılsa da gevşemesin diye.
 */

/** `POST /admin/mail-routing/accounts` */
export class CreateMailSenderAccountDto implements MailSenderAccountInput {
  @ApiProperty({ example: "siparis@tarodan.com.tr" })
  @IsEmail()
  @MaxLength(254)
  address: string;

  @ApiProperty({ example: "Tarodan Sipariş" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MAIL_DISPLAY_NAME_LENGTH)
  displayName: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "null = env'deki SMTP_HOST",
  })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  host?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 587 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  secure?: boolean | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "SMTP kullanıcı adı; boşsa adres",
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  username?: string | null;

  @ApiPropertyOptional({
    description: "Oluştururken zorunlu; güncellemede verilmezse korunur",
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;
}

/** `PATCH /admin/mail-routing/accounts/:id` */
export class UpdateMailSenderAccountDto extends PartialType(
  CreateMailSenderAccountDto,
) {}

/** `POST /admin/mail-routing/accounts/:id/test` */
export class TestMailSenderAccountDto {
  @ApiProperty({ example: "serhat@tarodan.com.tr" })
  @IsEmail()
  @MaxLength(254)
  to: string;
}

export class MailInternalEventChangeDto {
  @ApiProperty({ enum: MAIL_INTERNAL_EVENT_IDS })
  @IsString()
  @IsIn(MAIL_INTERNAL_EVENT_IDS)
  id: MailInternalEventId;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ enum: MAIL_DELIVERY_MODES })
  @IsString()
  @IsIn(MAIL_DELIVERY_MODES)
  delivery: MailDeliveryMode;
}

/** `PATCH /admin/mail-routing/areas/:areaId` */
export class UpdateMailAreaDto implements MailAreaUpdate {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  senderAccountId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MAIL_DISPLAY_NAME_LENGTH)
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  replyTo?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_INTERNAL_RECIPIENTS })
  @IsOptional()
  @IsArray()
  // Tekilleştirme sonrası sınır serviste; burada kaba üst sınır.
  @ArrayMaxSize(MAX_INTERNAL_RECIPIENTS * 2)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  internalRecipients?: string[];

  @ApiPropertyOptional({ type: [MailInternalEventChangeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAIL_INTERNAL_EVENT_IDS.length)
  @ValidateNested({ each: true })
  @Type(() => MailInternalEventChangeDto)
  events?: MailInternalEventChangeDto[];
}
