import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import {
  ADMIN_CANCEL_NOTE_MAX,
  ADMIN_CANCEL_REASON_CODES,
  ADMIN_ORDER_CANCEL_KINDS,
  type AdminCancelReasonCode,
  type AdminOrderCancelKind,
  type AdminOrderCancelRequest,
} from "@tarodan/types";

/**
 * POST /admin/orders/:id/cancel — yönetici (platform) iptali; ödenmemiş,
 * kargo öncesi ödenmiş ve teklif siparişi için tek uç. "Diğer" nedeninde
 * notun zorunluluğu paylaşılan kuraldır (`adminCancelRequestProblem`) ve
 * serviste doğrulanır.
 */
export class AdminCancelOrderDto implements AdminOrderCancelRequest {
  @ApiProperty({
    enum: ADMIN_CANCEL_REASON_CODES,
    description:
      "Katalog nedeni — alıcıya ve satıcıya bu kodun ETİKETİ söylenir",
  })
  @IsIn(ADMIN_CANCEL_REASON_CODES)
  reasonCode!: AdminCancelReasonCode;

  @ApiPropertyOptional({
    maxLength: ADMIN_CANCEL_NOTE_MAX,
    description:
      "Yöneticinin iç notu — yalnız denetim kaydına yazılır, taraflara asla gösterilmez; neden 'other' ise zorunlu",
  })
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_CANCEL_NOTE_MAX)
  note?: string;

  @ApiProperty({
    enum: ADMIN_ORDER_CANCEL_KINDS,
    description:
      "Önizlemenin türü; kilit altında değişmişse (ör. sipariş az önce ödendi) iptal 409 ile durur",
  })
  @IsIn(ADMIN_ORDER_CANCEL_KINDS)
  expectedKind!: AdminOrderCancelKind;
}
