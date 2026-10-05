import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import {
  CONSENT_ACTIONS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_SOURCES,
  CONSENT_SUBJECT_TYPES,
  type ConsentAction,
  type ConsentDocumentKey,
  type ConsentSource,
  type ConsentSubjectType,
} from "@tarodan/types";

import { AdminListQueryDto } from "../../../common/list";

/**
 * Onay Kayıtları listesi ve Excel dökümü — ikisi AYNI filtreyi alır (döküm
 * ekranda görüleni indirir). Tarih aralığı kaydın oluştuğu an üzerindendir.
 */
export class ConsentRecordQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({
    example: "ahmet",
    description:
      "Üye adı / e-posta / kodu, misafir e-postası, ziyaretçi kimliği, IP, " +
      "sepet ya da sipariş numarası",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CONSENT_DOCUMENT_KEYS })
  @IsOptional()
  @IsIn(CONSENT_DOCUMENT_KEYS)
  document?: ConsentDocumentKey;

  @ApiPropertyOptional({ enum: CONSENT_ACTIONS })
  @IsOptional()
  @IsIn(CONSENT_ACTIONS)
  action?: ConsentAction;

  @ApiPropertyOptional({ enum: CONSENT_SOURCES })
  @IsOptional()
  @IsIn(CONSENT_SOURCES)
  source?: ConsentSource;

  @ApiPropertyOptional({ enum: CONSENT_SUBJECT_TYPES })
  @IsOptional()
  @IsIn(CONSENT_SUBJECT_TYPES)
  subjectType?: ConsentSubjectType;

  /** Kullanıcı detayındaki onaylar bölümü aynı listeyi üyeye daraltır. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}
