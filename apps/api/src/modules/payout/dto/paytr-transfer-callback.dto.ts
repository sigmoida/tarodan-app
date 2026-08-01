import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * PayTR platform transfer SONUCU callback gövdesi (2. aşama).
 * PayTR "OK" yanıtı görmedikçe bildirimi tekrarlar — bu yüzden alanlar DTO
 * katmanında opsiyoneldir (4xx dönmeyiz); hash ve alan doğrulamasını servis
 * yapar ve her durumda "OK" döner.
 */
export class PaytrTransferCallbackDto {
  /** Tamamlanan transferlerin trans_id listesi — HAM JSON string (hash bunun üzerinden). */
  @ApiPropertyOptional({
    description: "Completed transfer IDs (raw JSON string)",
  })
  @IsOptional()
  @IsString()
  trans_ids?: string;

  @ApiPropertyOptional({
    description: "base64(HMAC-SHA256(trans_ids + merchant_salt, merchant_key))",
  })
  @IsOptional()
  @IsString()
  hash?: string;
}
