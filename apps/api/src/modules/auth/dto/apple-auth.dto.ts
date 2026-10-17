import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  /**
   * One-time authorization code issued by Apple (mobile 1.1.0+). The server
   * exchanges it for a refresh token and stores it encrypted; it is revoked at
   * Apple on account deletion (App Store 5.1.1(v)). Older clients that do not
   * send it keep working unchanged.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  authorizationCode?: string;
}
