import { ApiPropertyOptional } from "@nestjs/swagger";
import { NetsisSyncKind, NetsisSyncStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { AdminListQueryDto } from "../../../../../common/list";

/**
 * `GET /admin/invoicing/netsis-sync` — sayfalama/sıralama/tarih aralığı
 * ortak liste sözleşmesinden (`AdminListQueryDto`); tür ve durum filtresi.
 * Tarih aralığı satırın açıldığı ana (`createdAt`) uygulanır.
 */
export class NetsisSyncQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: NetsisSyncKind })
  @IsOptional()
  @IsEnum(NetsisSyncKind)
  kind?: NetsisSyncKind;

  @ApiPropertyOptional({ enum: NetsisSyncStatus })
  @IsOptional()
  @IsEnum(NetsisSyncStatus)
  status?: NetsisSyncStatus;
}

/**
 * `POST /admin/invoicing/netsis-sync/:id/retry`. Gövde boşsa kayıt yeniden
 * kuyruğa alınır; `netsisRef` verilirse kayıt Netsis'te zaten bulunduğu için
 * o anahtarla eşleştirilip `synced` işaretlenir (sonucu bilinmeyen gönderimin
 * elle mutabakatı — yeniden göndermek çift kayıt olurdu).
 */
export class RetryNetsisSyncDto {
  @ApiPropertyOptional({
    description:
      "Netsis'te bulunan kaydın anahtarı (verilirse yeniden gönderilmez, eşleştirilir)",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  netsisRef?: string;
}
