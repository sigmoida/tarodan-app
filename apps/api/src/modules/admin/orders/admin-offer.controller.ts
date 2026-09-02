import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AdminJwtAuthGuard } from "../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/decorators/roles.decorator";
import { RequirePermission } from "../../auth/decorators/require-permission.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { AdminRoute } from "../../auth/decorators/admin-route.decorator";
import { AdminCancelOfferDto, AdminOfferQueryDto } from "../dto";
import { AdminOfferQueryService } from "./admin-offer-query.service";
import { AdminOfferService } from "./admin-offer.service";

/**
 * Teklifler admin'de /operations/orders "Teklifler" sekmesinde yaşar; URL
 * segmenti `offers` RolesGuard PERMISSION_MAP'te `orders` iznine eşlenir.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminOfferController {
  constructor(
    private readonly query: AdminOfferQueryService,
    private readonly service: AdminOfferService,
  ) {}

  @Get("offers")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Teklifleri listele (filtre + sıralama)" })
  async getOffers(@Query() query: AdminOfferQueryDto) {
    return this.query.getOffers(query);
  }

  @Get("offers/:id")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({
    summary:
      "Teklif detayı: pazarlık zinciri, bağlı sipariş, üründeki diğer teklifler",
  })
  @ApiParam({ name: "id", description: "Offer ID" })
  async getOffer(@Param("id") id: string) {
    return this.query.getOfferById(id);
  }

  @Post("offers/:id/cancel")
  @Roles(AdminRole.super_admin, AdminRole.admin)
  @RequirePermission("orders")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Teklifi iptal et (pending / ödenmemiş accepted); bağlı ödeme bekleyen sipariş de kapanır",
  })
  @ApiParam({ name: "id", description: "Offer ID" })
  async cancelOffer(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body() dto: AdminCancelOfferDto,
  ) {
    return this.service.cancelOffer(adminId, id, dto);
  }
}
