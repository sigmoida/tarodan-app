import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import {
  IsLegalName,
  IsTckn,
  NormalizeLegalName,
  NormalizeTckn,
} from "../../../common/validators/legal-identity";

/**
 * Üyenin kimlik kapısından gönderdiği alanlar. Her alan opsiyoneldir: üye
 * yalnız EKSİK olanları gönderir (ör. kayıtta ad-soyad verip TCKN vermeyen).
 * Gönderim sonrası üç alanın hepsi dolu olmalıdır; dolu bir alanı değiştirmek
 * yasaktır (servis kuralı).
 */
export class SubmitLegalIdentityDto {
  @ApiPropertyOptional({ example: "Ayşe Nur", description: "Yasal ad" })
  @IsOptional()
  @IsString()
  @NormalizeLegalName()
  @IsLegalName()
  legalFirstName?: string;

  @ApiPropertyOptional({ example: "Yılmaz", description: "Yasal soyad" })
  @IsOptional()
  @IsString()
  @NormalizeLegalName()
  @IsLegalName()
  legalLastName?: string;

  @ApiPropertyOptional({
    example: "10000000146",
    description:
      "T.C. Kimlik Numarası. Boşluk/tire temizlenir; 11 hane + checksum.",
  })
  @IsOptional()
  @IsString()
  @NormalizeTckn()
  @IsTckn()
  nationalId?: string;
}

/** Admin düzeltmesi: değişen alan(lar) + zorunlu gerekçe (denetim kaydına). */
export class AdminCorrectLegalIdentityDto extends SubmitLegalIdentityDto {
  @ApiProperty({
    example: "Nüfus cüzdanı görüldü, soyad yazımı düzeltildi",
    description: "Düzeltme gerekçesi (zorunlu, denetim kaydına yazılır)",
  })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(5, { message: "Gerekçe en az 5 karakter olmalıdır" })
  @MaxLength(500)
  reason!: string;
}
