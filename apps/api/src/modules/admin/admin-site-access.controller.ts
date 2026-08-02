import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminSiteAccessService } from "./admin-site-access.service";
import {
  CreateSiteAccessPinDto,
  SiteAccessPinQueryDto,
  UpdateSiteAccessPinDto,
} from "./dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminSiteAccessController {
  constructor(private readonly siteAccessService: AdminSiteAccessService) {}

  @Get("site-access-pins")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "List early-access invite codes" })
  async getPins(@Query() query: SiteAccessPinQueryDto) {
    return this.siteAccessService.getPins(query);
  }

  @Post("site-access-pins")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Create an early-access invite code" })
  async createPin(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateSiteAccessPinDto,
  ) {
    return this.siteAccessService.createPin(adminId, dto);
  }

  @Patch("site-access-pins/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @ApiOperation({ summary: "Update/revoke an early-access invite code" })
  @ApiParam({ name: "id" })
  async updatePin(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateSiteAccessPinDto,
  ) {
    return this.siteAccessService.updatePin(adminId, id, dto);
  }

  @Delete("site-access-pins/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete an early-access invite code" })
  @ApiParam({ name: "id" })
  async deletePin(@Param("id") id: string, @CurrentUser("id") adminId: string) {
    return this.siteAccessService.deletePin(adminId, id);
  }

  @Post("site-access-pins/:id/send-invite")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send/resend the invite email for a code" })
  @ApiParam({ name: "id" })
  async sendInvite(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
  ) {
    return this.siteAccessService.sendInvite(adminId, id);
  }
}
