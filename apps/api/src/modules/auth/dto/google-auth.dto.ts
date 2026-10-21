import { IsGoogleProof } from "./google-proof.validator";

/**
 * `POST /auth/google` takes one of two proofs (`IsGoogleProof`):
 *  - `code`: the authorization code of the web OAuth 2.0 auth-code flow (GSI
 *    popup); the API exchanges it with Google for the id_token.
 *  - `idToken`: the id_token (credential) native GSI returns on mobile.
 * Exactly one is required; both together are a 400.
 */
export class GoogleAuthDto {
  @IsGoogleProof("code")
  code?: string;

  @IsGoogleProof("idToken")
  idToken?: string;
}
