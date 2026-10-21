import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { AdminSignInMethodEventList, SignInMethods } from "@tarodan/types";

import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/decorators/roles.decorator";
import { RequirePermission } from "../../../auth/decorators/require-permission.decorator";
import { AdminRoute } from "../../../auth/decorators/admin-route.decorator";
import { AdminSignInMethodEventsQueryDto } from "../../dto/admin-sign-in-method-events-query.dto";
import { AdminUserSignInMethodsService } from "./admin-user-sign-in-methods.service";

/**
 * Admin user detail: the user's sign-in methods and their history (sign-in
 * methods plan, decision D9). Read-only.
 *
 * Every staff role that supports members opens it (the moderator too), but
 * only with the `users` permission itself: `@RequirePermission` narrows the
 * `users` segment, which `seller_performance` alone would also open.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminUserSignInMethodsController {
  constructor(private readonly service: AdminUserSignInMethodsService) {}

  @Get("users/:id/sign-in-methods")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission("users")
  @ApiOperation({
    summary: "A user's sign-in methods (password yes or no, linked providers)",
  })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: 200, description: "SignInMethods" })
  @ApiResponse({ status: 404, description: "Unknown user" })
  getSignInMethods(
    @Param("id", new ParseUUIDPipe()) userId: string,
  ): Promise<SignInMethods> {
    return this.service.getSignInMethods(userId);
  }

  @Get("users/:id/sign-in-methods/events")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @RequirePermission("users")
  @ApiOperation({
    summary:
      "A user's sign-in method events, newest first (no IP, user agent or token)",
  })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: 200, description: "AdminSignInMethodEventList" })
  @ApiResponse({ status: 404, description: "Unknown user" })
  listEvents(
    @Param("id", new ParseUUIDPipe()) userId: string,
    @Query() query: AdminSignInMethodEventsQueryDto,
  ): Promise<AdminSignInMethodEventList> {
    return this.service.listEvents(userId, query);
  }
}
