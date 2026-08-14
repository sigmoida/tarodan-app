import {
  ForbiddenException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { DiscountService } from "./discount.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountQueryDto,
  ValidateCouponDto,
  DiscountResponseDto,
  PaginatedDiscountsDto,
  ValidationResultDto,
  ActiveCampaignDto,
} from "./dto";
import { i18nMessage } from "../i18n";

@ApiTags("discounts")
@Controller("discounts")
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  /**
   * POST /discounts - Create a new discount
   * Admin: Can create global/category discounts
   * Seller: Can only create product/seller scope discounts for own products
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new discount/coupon" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Discount created successfully",
    type: DiscountResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Invalid data or duplicate coupon code",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Not authorized to create this type of discount",
  })
  async create(
    @CurrentUser("id") userId: string,
    @CurrentUser("isSeller") isSeller: boolean,
    @Body() dto: CreateDiscountDto,
  ): Promise<DiscountResponseDto> {
    // Bu uç SATICI ucudur: admin kampanyaları `/admin/discounts` üzerinden,
    // admin token'ıyla oluşturulur. Buradaki aktör hiçbir zaman admin sayılmaz.
    // Satıcı olmayan bir kullanıcı indirim tanımlayamaz (eskiden `isSeller`
    // okunuyor ama hiç kullanılmıyordu: ürünü olmayan herkes kayıt açabiliyordu).
    if (!isSeller) {
      throw new ForbiddenException(
        i18nMessage("server.discount.sellerRequired"),
      );
    }
    return this.discountService.create(dto, userId, false);
  }

  /**
   * GET /discounts - List discounts
   * Admin: All discounts
   * Seller: Only own discounts
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List discounts with pagination and filters" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of discounts",
    type: PaginatedDiscountsDto,
  })
  async findAll(
    @CurrentUser("id") userId: string,
    @Query() query: DiscountQueryDto,
  ): Promise<PaginatedDiscountsDto> {
    // Satıcı ucu: yalnız kendi kampanyalarını görür.
    return this.discountService.findAll(query, userId, false);
  }

  /**
   * GET /discounts/active - Get active public campaigns
   * Public endpoint for displaying promotions
   */
  @Get("active")
  @Public()
  @ApiOperation({ summary: "Get active public campaigns" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of active campaigns",
    type: [ActiveCampaignDto],
  })
  async getActiveCampaigns(): Promise<ActiveCampaignDto[]> {
    return this.discountService.getActiveCampaigns();
  }

  /**
   * POST /discounts/validate - Validate a coupon code
   */
  @Post("validate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Validate a coupon code" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Validation result",
    type: ValidationResultDto,
  })
  async validateCoupon(
    @CurrentUser("id") userId: string,
    @Body() dto: ValidateCouponDto,
  ): Promise<ValidationResultDto> {
    return this.discountService.validateCoupon(dto, userId);
  }

  /**
   * POST /discounts/validate-guest - Validate a coupon for a GUEST cart (no auth).
   * Kişi-başı limit kontrol edilmez (kimlik yok); sadece toplam limit + tarih +
   * min sepet uygulanır. Nihai kupon denetimi checkout'ta sunucu tarafında yapılır.
   */
  @Post("validate-guest")
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Validate a coupon code for a guest cart" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Validation result",
    type: ValidationResultDto,
  })
  async validateGuestCoupon(
    @Body() dto: ValidateCouponDto,
  ): Promise<ValidationResultDto> {
    return this.discountService.validateCoupon(dto, null);
  }

  /**
   * GET /discounts/:id - Get discount details
   */
  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get discount details" })
  @ApiParam({ name: "id", description: "Discount ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Discount details",
    type: DiscountResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Discount not found",
  })
  async findOne(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<DiscountResponseDto> {
    // Satıcı ucu; admin işlemleri `/admin/discounts` üzerindedir.
    const isAdmin = false;
    return this.discountService.findOne(id, userId, isAdmin);
  }

  /**
   * PATCH /discounts/:id - Update discount
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update discount" })
  @ApiParam({ name: "id", description: "Discount ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Discount updated",
    type: DiscountResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Discount not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Not authorized to update this discount",
  })
  async update(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateDiscountDto,
  ): Promise<DiscountResponseDto> {
    // Satıcı ucu; admin işlemleri `/admin/discounts` üzerindedir.
    const isAdmin = false;
    return this.discountService.update(id, dto, userId, isAdmin);
  }

  /**
   * DELETE /discounts/:id - Delete discount
   */
  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete discount" })
  @ApiParam({ name: "id", description: "Discount ID" })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: "Discount deleted",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Discount not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Not authorized to delete this discount",
  })
  async delete(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<void> {
    // Satıcı ucu; admin işlemleri `/admin/discounts` üzerindedir.
    const isAdmin = false;
    return this.discountService.delete(id, userId, isAdmin);
  }
}
