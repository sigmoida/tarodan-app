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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import type { AdminHeroSlideDto, AdminTrustBadgeDto } from "@tarodan/types";
import { UPLOAD_MULTER_OPTIONS } from "../../../common/upload/multer-options";
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { HeroSlideService } from "../../hero/hero-slide.service";
import { TrustBadgeService } from "../../hero/trust-badge.service";
import {
  AdminHeroSlideQueryDto,
  CreateHeroSlideDto,
  CreateTrustBadgeDto,
  ReorderHeroItemsDto,
  UpdateHeroSlideDto,
  UpdateTrustBadgeDto,
} from "../../hero/dto";
import { AdminHeroService } from "./admin-hero.service";

/**
 * Vitrin hero'su (Pazarlama → Hero) ve ana sayfa güven rozetleri. Reklamla
 * aynı roller; izin matrisinde `hero-slides` ve `trust-badges` segmentleri
 * `ads` iznine bağlıdır (PERMISSION_MAP). Okuma domain servisinden, yazma
 * denetim kaydıyla `AdminHeroService`'ten.
 *
 * Literal yollar (`reorder`, `upload`) `:id` yollarından ÖNCE tanımlıdır:
 * Nest kayıt sırasıyla eşler.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminHeroController {
  constructor(
    private readonly heroSlides: HeroSlideService,
    private readonly trustBadges: TrustBadgeService,
    private readonly admin: AdminHeroService,
  ) {}

  // ==================== HERO SLIDES ====================

  @Get("hero-slides")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "List hero slides (incl. inactive/scheduled, with counters); optional ?placement=",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminHeroSlideDto[]" })
  listSlides(
    @Query() query: AdminHeroSlideQueryDto,
  ): Promise<AdminHeroSlideDto[]> {
    return this.heroSlides.list(query.placement);
  }

  @Patch("hero-slides/reorder")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reorder the slides of ONE placement (array order = displayOrder)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminHeroSlideDto[] of the placement" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Mixed placements" })
  reorderSlides(
    @CurrentUser("id") adminId: string,
    @Body() dto: ReorderHeroItemsDto,
  ): Promise<AdminHeroSlideDto[]> {
    return this.admin.reorderSlides(adminId, dto.ids);
  }

  @Post("hero-slides/upload")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @UseInterceptors(FileInterceptor("file", UPLOAD_MULTER_OPTIONS))
  @ApiOperation({
    summary:
      "Upload a hero image (multipart `file`, jpeg/png/webp, 5 MB; resized to max 2400 px wide; needs only the `ads` permission)",
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "{ url } — store as imageUrl / mobileImageUrl",
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "S3_PUBLIC_BASE_URL is not configured",
  })
  // URL segmenti `hero-slides` → izin matrisinde `ads`: ürün (`media` →
  // `products`) yüklemesine erişmeden yüklenir.
  uploadSlideImage(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    return this.heroSlides.uploadImage(file);
  }

  @Get("hero-slides/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get a hero slide" })
  @ApiParam({ name: "id", description: "Hero slide ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminHeroSlideDto" })
  getSlide(@Param("id") id: string): Promise<AdminHeroSlideDto> {
    return this.heroSlides.get(id);
  }

  @Post("hero-slides")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a hero slide" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "AdminHeroSlideDto" })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "More than HERO_MAX_SLIDES would be live at once",
  })
  createSlide(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateHeroSlideDto,
  ): Promise<AdminHeroSlideDto> {
    return this.admin.createSlide(adminId, dto);
  }

  @Patch("hero-slides/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Update a hero slide (absent = keep, null = clear nullable fields)",
  })
  @ApiParam({ name: "id", description: "Hero slide ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminHeroSlideDto" })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      "Would take the last live home slide offline, or exceed the live limit",
  })
  updateSlide(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: UpdateHeroSlideDto,
  ): Promise<AdminHeroSlideDto> {
    return this.admin.updateSlide(adminId, id, dto);
  }

  @Delete("hero-slides/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a hero slide" })
  @ApiParam({ name: "id", description: "Hero slide ID" })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: "Deleted" })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "It is the last live home slide",
  })
  removeSlide(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
  ): Promise<void> {
    return this.admin.removeSlide(adminId, id);
  }

  // ==================== TRUST BADGES ====================

  @Get("trust-badges")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "List trust badges (incl. inactive; raw text with timing tokens)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminTrustBadgeDto[]" })
  listBadges(): Promise<AdminTrustBadgeDto[]> {
    return this.trustBadges.list();
  }

  @Patch("trust-badges/reorder")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reorder trust badges (array order = displayOrder)" })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminTrustBadgeDto[]" })
  reorderBadges(
    @CurrentUser("id") adminId: string,
    @Body() dto: ReorderHeroItemsDto,
  ): Promise<AdminTrustBadgeDto[]> {
    return this.admin.reorderBadges(adminId, dto.ids);
  }

  @Get("trust-badges/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Get a trust badge" })
  @ApiParam({ name: "id", description: "Trust badge ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminTrustBadgeDto" })
  getBadge(@Param("id") id: string): Promise<AdminTrustBadgeDto> {
    return this.trustBadges.get(id);
  }

  @Post("trust-badges")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Create a trust badge" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "AdminTrustBadgeDto" })
  createBadge(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateTrustBadgeDto,
  ): Promise<AdminTrustBadgeDto> {
    return this.admin.createBadge(adminId, dto);
  }

  @Patch("trust-badges/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary: "Update a trust badge (absent = keep, null = clear description)",
  })
  @ApiParam({ name: "id", description: "Trust badge ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "AdminTrustBadgeDto" })
  updateBadge(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTrustBadgeDto,
  ): Promise<AdminTrustBadgeDto> {
    return this.admin.updateBadge(adminId, id, dto);
  }

  @Delete("trust-badges/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a trust badge" })
  @ApiParam({ name: "id", description: "Trust badge ID" })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: "Deleted" })
  removeBadge(
    @CurrentUser("id") adminId: string,
    @Param("id") id: string,
  ): Promise<void> {
    return this.admin.removeBadge(adminId, id);
  }
}
