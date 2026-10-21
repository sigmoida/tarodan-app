import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";
import {
  SIGN_IN_PROVIDERS,
  type ReauthResponse,
  type SignInProvider,
} from "@tarodan/types";
import {
  IsGoogleProof,
  PROVIDER_PROOF_MAX_LENGTH,
} from "../../dto/google-proof.validator";

/** Bounds only: a current password is checked as typed, never re-validated. */
const PASSWORD_PROOF_MAX_LENGTH = 1024;

const hasGoogleProvider = (body: Record<string, unknown>) =>
  body.provider === "google";

/**
 * Proof for `POST /auth/reauth` (`ReauthRequest` in `@tarodan/types`).
 * `provider` selects the method; without it the proof is the password.
 */
export class ReauthDto {
  @ApiPropertyOptional({
    enum: SIGN_IN_PROVIDERS,
    description:
      "Selects a provider proof. Without it the proof is the password.",
  })
  @IsOptional()
  @IsIn(SIGN_IN_PROVIDERS)
  provider?: SignInProvider;

  @ApiPropertyOptional({ description: "Current password (no provider)" })
  @ValidateIf((o: ReauthDto) => o.provider == null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_PROOF_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({
    description:
      "Google auth code from the web popup (google; never with idToken)",
  })
  @IsGoogleProof("code", hasGoogleProvider)
  code?: string;

  @ApiPropertyOptional({
    description:
      "Google id_token from native sign-in (google; never with code)",
  })
  @IsGoogleProof("idToken", hasGoogleProvider)
  idToken?: string;

  @ApiPropertyOptional({ description: "Apple identity token (apple)" })
  @ValidateIf((o: ReauthDto) => o.provider === "apple")
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROVIDER_PROOF_MAX_LENGTH)
  identityToken?: string;
}

export class ReauthResponseDto implements ReauthResponse {
  @ApiProperty({ description: "Opaque step-up token; keep it in memory only" })
  reauthToken: string;

  @ApiProperty({ description: "ISO 8601 expiry of the token" })
  expiresAt: string;
}
