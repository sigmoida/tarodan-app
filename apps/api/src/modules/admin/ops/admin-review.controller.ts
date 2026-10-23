import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import { AdminService } from "../admin.service";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import {
  RatingQueryDto,
  AdminUserRatingQueryDto,
  UpdateRatingStatusDto,
} from "../dto";

@ApiTags("admin")
@Controller("admin")
@AdminRoute() // Mark as admin route to skip global JwtAuthGuard
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminReviewController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== REVIEWS & RATINGS ====================

  @Get("reviews")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all reviews" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of reviews" })
  async getReviews(@Query() query: RatingQueryDto) {
    return this.adminService.getReviews(query);
  }

  @Patch("reviews/:id/status")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update review status" })
  @ApiParam({ name: "id", description: "Review ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Review status updated" })
  async updateReviewStatus(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateRatingStatusDto,
  ) {
    return this.adminService.updateReviewStatus(adminId, id, dto.status);
  }

  // ==================== SELLER (USER) RATINGS ====================

  @Get("user-ratings")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get all seller/user ratings" })
  @ApiResponse({ status: HttpStatus.OK, description: "List of user ratings" })
  async getUserRatings(@Query() query: AdminUserRatingQueryDto) {
    return this.adminService.getUserRatings(query);
  }

  @Patch("user-ratings/:id/status")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Update seller rating status (approve/reject)" })
  @ApiParam({ name: "id", description: "User Rating ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Status updated" })
  async updateUserRatingStatus(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: UpdateRatingStatusDto,
  ) {
    return this.adminService.updateUserRatingStatus(adminId, id, dto.status);
  }
}
