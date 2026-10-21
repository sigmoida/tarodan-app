import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { ReauthGuard } from "./reauth.guard";

/**
 * Marks a sensitive write that needs a fresh step-up: the body must carry the
 * `reauthToken` from `POST /auth/reauth` (declare it in the route's DTO too,
 * so the contract shows it).
 */
export const RequireReauth = () =>
  applyDecorators(
    UseGuards(ReauthGuard),
    ApiResponse({
      status: 403,
      description:
        "REAUTH_REQUIRED: missing, expired or foreign reauthToken (never 401)",
    }),
  );
