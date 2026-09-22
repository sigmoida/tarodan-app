import { IsIn, IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ADMIN_CANCELLATION_BUCKETS,
  ADMIN_CANCELLATION_TABS,
  type AdminCancellationBucket,
  type AdminCancellationTab,
} from "@tarodan/types";
import { AdminListQueryDto } from "../../../common/list";

/**
 * İptaller listesi ve sayaçlarının ortak filtreleri. Her metin filtresi TEK
 * bir kolon ailesini arar (bkz. `orders/helpers/cancellation-where.ts`);
 * `search` hepsini birden tarar. `startDate` / `endDate` İPTAL anına uygulanır.
 */
export class AdminCancellationCountsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: "ORD-123" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: "ORD-123",
    description: "Sipariş no (takasta takas no)",
  })
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @ApiPropertyOptional({
    example: "123456789",
    description: "Kargo kodu: taşıyıcı takip no ya da iç takip no",
  })
  @IsOptional()
  @IsString()
  cargoCode?: string;

  @ApiPropertyOptional({ example: "GRP-123" })
  @IsOptional()
  @IsString()
  groupNumber?: string;

  @ApiPropertyOptional({
    example: "K010001",
    description:
      "Alıcı veya satıcı: ad, e-posta, kullanıcı kodu ya da kullanıcı id'si",
  })
  @IsOptional()
  @IsString()
  party?: string;
}

export class AdminCancellationQueryDto extends AdminCancellationCountsQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_CANCELLATION_TABS,
    description: "Sekme: tüm iptaller / doğrudan satış / teklifler / takaslar",
  })
  @IsOptional()
  @IsIn(ADMIN_CANCELLATION_TABS)
  tab?: AdminCancellationTab;

  @ApiPropertyOptional({
    enum: ADMIN_CANCELLATION_BUCKETS,
    description:
      "Alt sekme: tümü / yeni (24 saat) / alıcı / satıcı / Tarodan iptali",
  })
  @IsOptional()
  @IsIn(ADMIN_CANCELLATION_BUCKETS)
  bucket?: AdminCancellationBucket;
}
