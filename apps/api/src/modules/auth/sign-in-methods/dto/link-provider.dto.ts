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
  type AppleLinkRequest,
  type GoogleLinkRequest,
  type SignInProvider,
  type UnlinkProviderRequest,
} from "@tarodan/types";
import { PROVIDER_PROOF_MAX_LENGTH } from "../../reauth/dto/reauth.dto";
import { REAUTH_TOKEN_MAX_LENGTH } from "../../reauth/reauth.service";

/** The step-up token every link and unlink carries (`@RequireReauth`). */
class ReauthTokenBody {
  @ApiProperty({ description: "Step-up token from POST /auth/reauth" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REAUTH_TOKEN_MAX_LENGTH)
  reauthToken: string;
}

/** `POST /auth/social/google/link` (`GoogleLinkRequest` in `@tarodan/types`). */
export class GoogleLinkDto
  extends ReauthTokenBody
  implements GoogleLinkRequest
{
  @ApiPropertyOptional({
    description: "Google auth code from the web popup (no idToken)",
  })
  @ValidateIf((o: GoogleLinkDto) => !o.idToken)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROVIDER_PROOF_MAX_LENGTH)
  code?: string;

  @ApiPropertyOptional({
    description: "Google id_token from native sign-in (no code)",
  })
  @ValidateIf((o: GoogleLinkDto) => !o.code)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROVIDER_PROOF_MAX_LENGTH)
  idToken?: string;
}

/** `POST /auth/social/apple/link` (`AppleLinkRequest` in `@tarodan/types`). */
export class AppleLinkDto extends ReauthTokenBody implements AppleLinkRequest {
  @ApiProperty({ description: "Apple identity token" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROVIDER_PROOF_MAX_LENGTH)
  identityToken: string;

  @ApiPropertyOptional({
    description:
      "Apple authorization code (mobile), stored for revocation on unlink and account deletion",
  })
  @IsOptional()
  @IsString()
  @MaxLength(PROVIDER_PROOF_MAX_LENGTH)
  authorizationCode?: string;
}

/** `POST /auth/social/:provider/unlink` (`UnlinkProviderRequest`). */
export class UnlinkProviderDto
  extends ReauthTokenBody
  implements UnlinkProviderRequest {}

/** The `:provider` route segment of the unlink route. */
export class SignInProviderParamDto {
  @ApiProperty({ enum: SIGN_IN_PROVIDERS })
  @IsIn(SIGN_IN_PROVIDERS)
  provider: SignInProvider;
}
