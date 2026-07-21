import { IsString, IsNotEmpty, ValidateIf } from "class-validator";

/**
 * Google auth kabul iki biçim alır:
 *  - `code`    : Web'in OAuth 2.0 auth-code flow'undan gelen yetki kodu (GSI popup).
 *                Backend bunu Google ile takas edip id_token'ı elde eder.
 *  - `idToken` : Mobil/native GSI'nin doğrudan verdiği id_token (credential).
 * En az biri zorunlu; her alan yalnız diğeri yokken doğrulanır.
 */
export class GoogleAuthDto {
  @ValidateIf((o) => !o.idToken)
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ValidateIf((o) => !o.code)
  @IsString()
  @IsNotEmpty()
  idToken?: string;
}
