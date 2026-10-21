import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "../interfaces";
import { reauthRequiredError, ReauthService } from "./reauth.service";

/**
 * Lets a request through only with a live step-up token of the signed-in
 * user in the body (`reauthToken`). Runs after the global `JwtAuthGuard`, so
 * `req.user` is the session owner. A missing, expired or foreign token, and
 * Redis being down, all answer `403 REAUTH_REQUIRED` (never 401).
 *
 * Apply it with `@RequireReauth()`, not directly.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(private readonly reauth: ReauthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const userId = request.user?.id;
    const token: unknown = (
      request.body as { reauthToken?: unknown } | undefined
    )?.reauthToken;
    if (!userId || !(await this.reauth.isValidToken(userId, token))) {
      throw reauthRequiredError();
    }
    return true;
  }
}
