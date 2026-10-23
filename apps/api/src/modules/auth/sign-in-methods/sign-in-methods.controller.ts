import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { ReauthResponse, SignInMethods } from "@tarodan/types";
import { clientIpThrottle } from "../../../common/helpers/client-ip";
import { CurrentUser } from "../decorators";
import { ReauthDto, ReauthResponseDto } from "../reauth/dto/reauth.dto";
import { ReauthService } from "../reauth/reauth.service";
import { RequireReauth } from "../reauth/require-reauth.decorator";
import {
  AppleLinkDto,
  GoogleLinkDto,
  SignInProviderParamDto,
  UnlinkProviderDto,
} from "./dto/link-provider.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { SignInMethodsDto } from "./dto/sign-in-methods.dto";
import { SignInMethodsService } from "./sign-in-methods.service";

/**
 * Sign-in methods of the signed-in user and the step-up that guards changes
 * to them. Every route needs a session (global `JwtAuthGuard`); the writes
 * also need a `reauthToken`. No step-up or provider token problem answers
 * 401: both clients read 401 as an expired session.
 *
 * The strict limits count per client IP (`clientIpThrottle`), not per
 * `req.ip`: web traffic arrives from the gateway, and one shared bucket
 * would let one web user exhaust the step-up for every other web user.
 * The throttler runs before the session guard, so a per-user bucket is not
 * available here; the step-up lockout is per user (`ReauthService`).
 */
@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
export class SignInMethodsController {
  constructor(
    private readonly signInMethods: SignInMethodsService,
    private readonly reauth: ReauthService,
  ) {}

  @Get("sign-in-methods")
  @ApiOperation({ summary: "Password and linked providers of the account" })
  @ApiResponse({ status: 200, type: SignInMethodsDto })
  getSignInMethods(@CurrentUser("id") userId: string): Promise<SignInMethods> {
    return this.signInMethods.getSignInMethods(userId);
  }

  @Post("reauth")
  @HttpCode(HttpStatus.OK)
  @Throttle(clientIpThrottle(5))
  @ApiOperation({ summary: "Confirm it's you; returns a short-lived token" })
  @ApiResponse({ status: 200, type: ReauthResponseDto })
  @ApiResponse({
    status: 400,
    description: "reauthMethodNotAllowed: the account has a password",
  })
  @ApiResponse({ status: 403, description: "REAUTH_FAILED: wrong proof" })
  @ApiResponse({ status: 429, description: "reauthLocked: too many failures" })
  @ApiResponse({ status: 503, description: "reauthUnavailable" })
  reauthenticate(
    @CurrentUser("id") userId: string,
    @Body() dto: ReauthDto,
  ): Promise<ReauthResponse> {
    return this.reauth.reauthenticate(userId, dto);
  }

  @Post("password/set")
  @HttpCode(HttpStatus.OK)
  @Throttle(clientIpThrottle(5))
  @RequireReauth()
  @ApiOperation({ summary: "Set a first password (account without one)" })
  @ApiResponse({ status: 200, type: SignInMethodsDto })
  @ApiResponse({
    status: 409,
    description: "passwordAlreadySet: the account already has a password",
  })
  setPassword(
    @CurrentUser("id") userId: string,
    @Body() dto: SetPasswordDto,
  ): Promise<SignInMethods> {
    return this.signInMethods.setPassword(userId, dto.newPassword);
  }

  @Post("social/google/link")
  @HttpCode(HttpStatus.OK)
  @Throttle(clientIpThrottle(10))
  @RequireReauth()
  @ApiOperation({ summary: "Connect a Google account to this account" })
  @ApiResponse({ status: 200, type: SignInMethodsDto })
  @ApiResponse({
    status: 400,
    description: "PROVIDER_TOKEN_INVALID: the Google token was refused",
  })
  @ApiResponse({
    status: 409,
    description: "PROVIDER_ALREADY_LINKED or PROVIDER_LINKED_TO_OTHER_ACCOUNT",
  })
  linkGoogle(
    @CurrentUser("id") userId: string,
    @Body() dto: GoogleLinkDto,
  ): Promise<SignInMethods> {
    return this.signInMethods.linkGoogle(userId, dto);
  }

  @Post("social/apple/link")
  @HttpCode(HttpStatus.OK)
  @Throttle(clientIpThrottle(10))
  @RequireReauth()
  @ApiOperation({ summary: "Connect an Apple account to this account" })
  @ApiResponse({ status: 200, type: SignInMethodsDto })
  @ApiResponse({
    status: 400,
    description: "PROVIDER_TOKEN_INVALID: the Apple token was refused",
  })
  @ApiResponse({
    status: 409,
    description: "PROVIDER_ALREADY_LINKED or PROVIDER_LINKED_TO_OTHER_ACCOUNT",
  })
  linkApple(
    @CurrentUser("id") userId: string,
    @Body() dto: AppleLinkDto,
  ): Promise<SignInMethods> {
    return this.signInMethods.linkApple(userId, dto);
  }

  /** A POST, not a DELETE with a body: some clients and proxies drop it. */
  @Post("social/:provider/unlink")
  @HttpCode(HttpStatus.OK)
  @Throttle(clientIpThrottle(10))
  @RequireReauth()
  @ApiOperation({ summary: "Disconnect a provider from this account" })
  @ApiResponse({ status: 200, type: SignInMethodsDto })
  @ApiResponse({
    status: 404,
    description: "PROVIDER_NOT_LINKED: the provider is not connected",
  })
  @ApiResponse({
    status: 409,
    description: "LAST_SIGN_IN_METHOD: a password or a Google link must remain",
  })
  unlinkProvider(
    @CurrentUser("id") userId: string,
    @Param() params: SignInProviderParamDto,
    // Validated for the contract; the guard reads the token itself.
    @Body() _dto: UnlinkProviderDto,
  ): Promise<SignInMethods> {
    return this.signInMethods.unlink(userId, params.provider);
  }
}
