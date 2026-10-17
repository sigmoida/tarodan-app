import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsUUID,
  ValidateNested,
} from "class-validator";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_DOCUMENT_KEYS,
} from "@tarodan/types";

/** Yeniden-onay kapısı: üyenin şimdi onayladığı belgeler. */
export class AcceptConsentsDto {
  @ApiProperty({
    enum: ACCOUNT_REQUIRED_CONSENTS,
    isArray: true,
    example: ["terms", "privacy", "kvkk"],
    description:
      "Onaylanan belgeler. Yalnız hesap için zorunlu belgeler kabul edilir; " +
      "sürüm sunucuda damgalanır.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONSENT_DOCUMENT_KEYS.length)
  @IsIn(CONSENT_DOCUMENT_KEYS, { each: true })
  documents!: string[];
}

export class CookiePreferencesDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  functional!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  analytics!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  marketing!: boolean;
}

/** Çerez bandı kaydı. Zorunlu kategori her zaman açıktır, gönderilmez. */
export class CookieConsentDto {
  @ApiProperty({
    example: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
    description:
      "Tarayıcıda üretilip saklanan kalıcı ziyaretçi kimliği (UUID). Giriş " +
      "yapılmamışken kaydın tek sahibi budur.",
  })
  @IsUUID()
  visitorId!: string;

  @ApiProperty({ type: CookiePreferencesDto })
  @ValidateNested()
  @Type(() => CookiePreferencesDto)
  preferences!: CookiePreferencesDto;
}
