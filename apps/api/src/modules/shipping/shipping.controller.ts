import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { ShippingService } from "./shipping.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateShipmentDto,
  CalculateShippingDto,
  UpdateTrackingDto,
  ShipmentResponseDto,
  ShippingRatesResponseDto,
} from "./dto";

@ApiTags("shipping")
@Controller("shipping")
export class ShippingController {
  constructor(
    private readonly shippingService: ShippingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /shipping/carriers - List available shipping carriers
   * Requirement: "shipping companies (2 providers)" (requirements.txt)
   */
  @Get("carriers")
  @Public()
  @ApiOperation({ summary: "List available shipping carriers" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "List of shipping carriers",
  })
  async getCarriers() {
    return this.shippingService.getCarriers();
  }

  /**
   * GET /shipping/package-tiers — satıcının ilanda seçeceği paket boyutları.
   *
   * Aktif tarifeden okunur; satıcıya etiket, tutar ve örnek ölçü döner. Desi
   * aralığı YANİ iç muhasebe birimi de gönderilir çünkü ilan formu seçime göre
   * net kazanç önizlemesi ister — ama arayüz onu göstermez (yalnız admin görür).
   */
  @Get("package-tiers")
  @Public()
  @ApiOperation({ summary: "List the active tariff's seller package tiers" })
  @ApiResponse({ status: HttpStatus.OK, description: "Package tiers" })
  async getPackageTiers() {
    return this.shippingService.getPackageTiers();
  }

  /**
   * GET /shipping/rates - Get shipping rate by city (for checkout)
   * Query: city, carrier (surat), weight (kg, default 0.5)
   */
  @Get("rates")
  @Public()
  @ApiOperation({ summary: "Get shipping rate by city and carrier" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Single rate for the given city/carrier",
  })
  async getRatesByCity(
    @Query("city") city: string,
    @Query("carrier") carrier: string,
    @Query("weight") weight?: string,
  ): Promise<{ rate: number }> {
    const weightKg = weight ? parseFloat(weight) || 0.5 : 0.5;
    return this.shippingService.getRateByCity(
      city || "",
      carrier || "surat",
      weightKg,
    );
  }

  /**
   * POST /shipping/rates - Calculate shipping rates (by address IDs)
   * Requirement: Real-time cost calculation (project.md)
   */
  @Post("rates")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Calculate shipping rates for addresses" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Shipping rates",
    type: ShippingRatesResponseDto,
  })
  async calculateRates(
    @Body() dto: CalculateShippingDto,
  ): Promise<ShippingRatesResponseDto> {
    return this.shippingService.calculateRates(dto);
  }

  /**
   * POST /shipping - Create shipment
   * Requirement: Shipping provider integration (project.md)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create shipment for an order (seller only)" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Shipment created",
    type: ShipmentResponseDto,
  })
  async createShipment(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateShipmentDto,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.createShipment(userId, dto);
  }

  /**
   * PATCH /shipping/:id/tracking - Update tracking number
   */
  @Patch(":id/tracking")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update shipment tracking number (seller only)" })
  @ApiParam({ name: "id", description: "Shipment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Tracking updated",
    type: ShipmentResponseDto,
  })
  async updateTracking(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateTrackingDto,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.updateTracking(id, userId, dto);
  }

  /**
   * POST /shipping/webhook/:provider - Cargo provider webhook
   * Public endpoint for provider callbacks
   */
  @Post("webhook/:provider")
  @Public()
  // #87: Public + statik secret'lı uç → replay/abuse'a karşı IP başına rate-limit.
  // Cömert (legit kargo webhook'unu bloklamaz) ama replay-flood'u keser. Testte
  // ThrottlerModule.skipIf ile atlanır (davranış fonksiyonel testleri etkilemez).
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Webhook for cargo provider status updates (requires X-Webhook-Secret header)",
  })
  @ApiParam({ name: "provider", description: "Provider name (surat)" })
  async providerWebhook(
    @Param("provider") provider: string,
    @Headers("x-webhook-secret") secretHeader: string | undefined,
    @Body() payload: any,
  ) {
    // 11.2a (G2): Sürat entegrasyonu POLL-tabanlı (SuratTrackingService düzenli sorgular);
    // gerçek bir callback sözleşmesi yok. Bu uç, statik secret + tahmin-edilebilir
    // trackingNumber(=orderNumber) ile escrow saatini erken başlatmaya (griefing) açıktı.
    // Bu yüzden VARSAYILAN KAPALI: yalnız `SHIPPING_WEBHOOK_ENABLED=true` iken çalışır
    // (gerçek imzalı bir callback devreye girerse açılır). Kapalıyken 404 → uç görünmez.
    const webhookEnabled =
      this.configService.get<string>("SHIPPING_WEBHOOK_ENABLED") === "true";
    if (!webhookEnabled) {
      throw new NotFoundException();
    }
    // Girdi doğrulama: forge edilmiş/bozuk gövde para-etkili geçişi sürüklemesin.
    if (
      !payload ||
      typeof (payload.trackingNumber ?? payload.tracking_no) !== "string" ||
      typeof payload.status !== "string"
    ) {
      throw new BadRequestException("Invalid webhook payload");
    }
    // Webhook secret validation (per-provider)
    const expectedSecret = this.configService.get<string>(
      `${provider.toUpperCase()}_WEBHOOK_SECRET`,
    );
    if (!expectedSecret) {
      throw new UnauthorizedException(
        `${provider} webhook secret not configured on server`,
      );
    }
    // #87: Sabit-zamanlı karşılaştırma — timing attack ile secret'ın sızmasını önler
    // (uzunluk farkı da eşitsizliktir; timingSafeEqual eşit uzunluk gerektirir).
    if (!secretHeader || !this.secretsMatch(secretHeader, expectedSecret)) {
      throw new UnauthorizedException("Invalid or missing webhook secret");
    }
    return this.shippingService.handleProviderWebhook(provider, payload);
  }

  private secretsMatch(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * GET /shipping/:id - Get shipment by ID
   */
  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get shipment details" })
  @ApiParam({ name: "id", description: "Shipment ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Shipment details",
    type: ShipmentResponseDto,
  })
  async findOne(
    @Param("id") id: string,
    @CurrentUser("id") userId: string,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.findOne(id, userId);
  }

  /**
   * GET /shipping/order/:orderId - Get shipment by order ID
   */
  @Get("order/:orderId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get shipment for an order" })
  @ApiParam({ name: "orderId", description: "Order ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Shipment details",
    type: ShipmentResponseDto,
  })
  async findByOrder(
    @Param("orderId") orderId: string,
    @CurrentUser("id") userId: string,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.findByOrder(orderId, userId);
  }
}
