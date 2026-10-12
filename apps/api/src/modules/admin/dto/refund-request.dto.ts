import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { RefundFaultParty, RefundReason } from "@prisma/client";
import {
  ADMIN_REFUND_BUCKETS,
  ADMIN_REFUND_TABS,
  REFUND_REQUEST_KINDS,
  type AdminRefundBucket,
  type AdminRefundTab,
  type RefundRequestKind,
} from "@tarodan/types";
import { AdminListQueryDto } from "../../../common/list";

/**
 * İadeler listesi, sayaçları ve Excel'inin ortak filtreleri (bkz.
 * `orders/helpers/refund-list-where.ts`). `search` talep / sipariş / takas
 * numarası, taraf (ad, e-posta, kullanıcı kodu), ürün ve kargo kodlarını
 * tarar; `dateFrom` / `dateTo` İADE tarihine İstanbul günü sınırlarıyla
 * uygulanır. Sıralama yalnız iade anına göredir (`sortOrder`).
 */
export class RefundRequestCountsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_REFUND_TABS,
    description:
      "Sekme: tüm iadeler / direkt satış / teklif / takas (varsayılan tümü)",
  })
  @IsOptional()
  @IsIn(ADMIN_REFUND_TABS)
  tab?: AdminRefundTab;

  @ApiPropertyOptional({ example: "RFD-K7X9M2QF3N" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: "2026-10-01",
    description: "İade tarihi başlangıcı (YYYY-MM-DD, İstanbul günü)",
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: "2026-10-12",
    description: "İade tarihi bitişi (YYYY-MM-DD, İstanbul günü, dahil)",
  })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: REFUND_REQUEST_KINDS,
    description:
      "Tür: kargo öncesi iptalin iadesi (`*_cancellation` politikası) ya da ürün iadesi",
  })
  @IsOptional()
  @IsIn(REFUND_REQUEST_KINDS)
  kind?: RefundRequestKind;
}

export class RefundRequestQueryDto extends RefundRequestCountsQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_REFUND_BUCKETS,
    description:
      "Alt sekme (kova): tümü / inceleme / ürün bekleniyor / depoda / iade ediliyor / tamamlanan / reddedilen / itirazlı",
  })
  @IsOptional()
  @IsIn(ADMIN_REFUND_BUCKETS)
  bucket?: AdminRefundBucket;
}

export class ApproveRefundRequestDto {
  @ApiPropertyOptional({ enum: RefundReason })
  @IsOptional()
  @IsEnum(RefundReason)
  resolvedReason?: RefundReason;

  @ApiPropertyOptional({ enum: RefundFaultParty })
  @IsOptional()
  @IsEnum(RefundFaultParty)
  faultParty?: RefundFaultParty;

  @ApiPropertyOptional({ description: "Token returned by decision-preview" })
  @IsOptional()
  @IsString()
  calculationToken?: string;

  @ApiPropertyOptional({
    example: "Kanıtlar incelendi, satıcı kaynaklı kusur doğrulandı.",
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RefundDecisionPreviewDto {
  @ApiProperty({ enum: RefundReason })
  @IsEnum(RefundReason)
  resolvedReason!: RefundReason;

  @ApiProperty({ enum: RefundFaultParty })
  @IsEnum(RefundFaultParty)
  faultParty!: RefundFaultParty;
}

export class RejectRefundRequestDto {
  @ApiProperty({
    example: "Gönderilen kanıtlar ürün kusurunu doğrulamıyor.",
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
