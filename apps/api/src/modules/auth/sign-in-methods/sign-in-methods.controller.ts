import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from "../decorators";
import { ReauthDto, ReauthResponseDto } from "../reauth/dto/reauth.dto";
import { ReauthService } from "../reauth/reauth.service";
import { RequireReauth } from "../reauth/require-reauth.decorator";
import { SetPasswordDto } from "./dto/set-password.dto";
import { SignInMethodsDto } from "./dto/sign-in-methods.dto";
import { SignInMethodsService } from "./sign-in-methods.service";

/**
 * Sign-in methods of the signed-in user and the step-up that guards changes
 * to them. Every route needs a session (global `JwtAuthGuard`); the writes
 * also need a `reauthToken`. No step-up problem answers 401.
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
}
