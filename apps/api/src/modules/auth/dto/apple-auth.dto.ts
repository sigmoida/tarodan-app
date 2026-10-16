import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  /**
   * Apple'ın verdiği tek kullanımlık yetkilendirme kodu (mobil 1.0.6+). Sunucu
   * refresh token'a çevirip şifreli saklar; hesap silmede Apple'a iptal edilir
   * (App Store 5.1.1(v)). Göndermeyen eski istemci aynen çalışır.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  authorizationCode?: string;
}
