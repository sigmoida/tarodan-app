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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ShippingService } from './shipping.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateShipmentDto,
  CalculateShippingDto,
  UpdateTrackingDto,
  ShipmentResponseDto,
  ShippingRatesResponseDto,
} from './dto';

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /**
   * GET /shipping/carriers - List available shipping carriers
   * Requirement: "shipping companies (2 providers)" (requirements.txt)
   */
  @Get('carriers')
  @Public()
  @ApiOperation({ summary: 'List available shipping carriers' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of shipping carriers',
  })
  async getCarriers() {
    return this.shippingService.getCarriers();
  }

  /**
   * GET /shipping/rates - Get shipping rate by city (for checkout)
   * Query: city, carrier (aras | yurtici | mng), weight (kg, default 0.5)
   */
  @Get('rates')
  @Public()
  @ApiOperation({ summary: 'Get shipping rate by city and carrier' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Single rate for the given city/carrier' })
  async getRatesByCity(
    @Query('city') city: string,
    @Query('carrier') carrier: string,
    @Query('weight') weight?: string,
  ): Promise<{ rate: number }> {
    const weightKg = weight ? parseFloat(weight) || 0.5 : 0.5;
    return this.shippingService.getRateByCity(city || '', carrier || 'aras', weightKg);
  }

  /**
   * POST /shipping/rates - Calculate shipping rates (by address IDs)
   * Requirement: Real-time cost calculation (project.md)
   */
  @Post('rates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate shipping rates for addresses' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Shipping rates',
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
  @ApiOperation({ summary: 'Create shipment for an order (seller only)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Shipment created',
    type: ShipmentResponseDto,
  })
  async createShipment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateShipmentDto,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.createShipment(userId, dto);
  }

  /**
   * PATCH /shipping/:id/tracking - Update tracking number
   */
  @Patch(':id/tracking')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update shipment tracking number (seller only)' })
  @ApiParam({ name: 'id', description: 'Shipment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tracking updated',
    type: ShipmentResponseDto,
  })
  async updateTracking(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTrackingDto,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.updateTracking(id, userId, dto);
  }

  /**
   * POST /shipping/webhook/:provider - Cargo provider webhook
   * Public endpoint for provider callbacks
   */
  @Post('webhook/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook for cargo provider status updates' })
  @ApiParam({ name: 'provider', description: 'Provider name (aras, yurtici, mng)' })
  async providerWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
  ) {
    return this.shippingService.handleProviderWebhook(provider, payload);
  }

  /**
   * GET /shipping/:id - Get shipment by ID
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shipment details' })
  @ApiParam({ name: 'id', description: 'Shipment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Shipment details',
    type: ShipmentResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.findOne(id, userId);
  }

  /**
   * GET /shipping/order/:orderId - Get shipment by order ID
   */
  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shipment for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Shipment details',
    type: ShipmentResponseDto,
  })
  async findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ShipmentResponseDto> {
    return this.shippingService.findByOrder(orderId, userId);
  }
}
