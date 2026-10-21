import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { SentryService } from "../../sentry/sentry.service";
import type { RequestUser } from "../interfaces";
import {
  DEFAULT_REAUTH_POLICY,
  REAUTH_POLICY_METADATA,
  readReauthToken,
  type ReauthPolicy,
} from "./reauth-policy";
import {
  AUTH_FLOW_TAG,
  reauthRequiredError,
  ReauthService,
} from "./reauth.service";

/**
 * Lets a request through only with a live step-up token of the signed-in
 * user (`readReauthToken`: body `reauthToken`, else the `X-Reauth-Token`
 * header). Runs after the global `JwtAuthGuard`, so `req.user` is the session
 * owner. A missing, expired or foreign token, and Redis being down, all answer
 * `403 REAUTH_REQUIRED` (never 401).
 *
 * A route with `required: "setting"` lets a request WITHOUT a token through
 * while the setting is off; a token that is sent is checked all the same.
 *
 * Apply it with `@RequireReauth()`, not directly.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reauth: ReauthService,
    private readonly reflector: Reflector,
    private readonly sentry: SentryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy =
      this.reflector.get<ReauthPolicy | undefined>(
        REAUTH_POLICY_METADATA,
        context.getHandler(),
      ) ?? DEFAULT_REAUTH_POLICY;
    if (policy.flow) this.sentry.setTag(AUTH_FLOW_TAG, policy.flow);

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const userId = request.user?.id;
    if (!userId) throw reauthRequiredError();

    const token = readReauthToken(request);
    if (token === undefined) {
      if (
        policy.required === "setting" &&
        !(await this.reauth.isRequiredForSensitiveActions())
      ) {
        return true;
      }
      throw reauthRequiredError();
    }
    if (!(await this.reauth.isValidToken(userId, token))) {
      throw reauthRequiredError();
    }
    return true;
  }
}
