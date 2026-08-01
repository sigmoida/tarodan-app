import { IsNumber, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * AI moderasyon eşikleri (0..1 aralığında oran). Uç eskiden gövdeyi düz bir TS
 * tipiyle alıyordu; TS tipi çalışma anında yok olduğu için global
 * ValidationPipe HİÇBİR şey denetlemiyordu ve değer olduğu gibi AI servisine
 * iletiliyordu. Panel 0-100 sürgüsüyle sınırlı olsa da uç doğrudan çağrılabilir:
 * negatif ya da 1'den büyük bir eşik moderasyonu sessizce devre dışı bırakır
 * (her şeyi kabul eder ya da her şeyi engeller).
 */
export class SetAiConfigDto {
  @ApiPropertyOptional({
    example: 0.2,
    description: "Otomatik kabul için ilgililik eşiği (0..1)",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  relevanceThreshold?: number;

  @ApiPropertyOptional({
    example: 0.7,
    description: "Engelleme için uygunsuzluk (NSFW) eşiği (0..1)",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  nsfwThreshold?: number;
}
