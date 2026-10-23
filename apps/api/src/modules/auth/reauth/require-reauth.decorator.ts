import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiResponse } from "@nestjs/swagger";
import { REAUTH_TOKEN_HEADER } from "@tarodan/types";
import { REAUTH_POLICY_METADATA, type ReauthPolicy } from "./reauth-policy";
import { ReauthGuard } from "./reauth.guard";

/**
 * Marks a sensitive write that needs a fresh step-up: the `reauthToken` from
 * `POST /auth/reauth`, in the body (declare it in the route's DTO too, so the
 * contract shows it) or, when the body has none, in the `X-Reauth-Token`
 * header.
 *
 * - `@RequireReauth()`: a token is always required.
 * - `@RequireReauth({ required: "setting", flow })`: a token that is sent is
 *   checked; without one the request passes while the setting
 *   `auth_require_reauth_for_sensitive_actions` is off (older mobile
 *   versions send none).
 */
export const RequireReauth = (policy: Partial<ReauthPolicy> = {}) => {
  const resolved: ReauthPolicy = { required: "always", ...policy };
  return applyDecorators(
    SetMetadata(REAUTH_POLICY_METADATA, resolved),
    UseGuards(ReauthGuard),
    ApiHeader({
      name: REAUTH_TOKEN_HEADER,
      required: false,
      description:
        "Step-up token from POST /auth/reauth, when the body has no reauthToken",
    }),
    ApiResponse({
      status: 403,
      description:
        resolved.required === "always"
          ? "REAUTH_REQUIRED: missing, expired or foreign reauthToken (never 401)"
          : "REAUTH_REQUIRED: expired or foreign reauthToken, or none while the setting requires one (never 401)",
    }),
  );
};
