import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  InitiatePaymentDto,
  IyzicoCallbackDto,
  PayTRCallbackDto,
  PaymentResponseDto,
  PaymentInitResponseDto,
  PaymentHoldResponseDto,
} from './dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments/initiate - Initiate payment
   */
  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate payment for an order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment initiated',
    type: PaymentInitResponseDto,
  })
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
  ): Promise<PaymentInitResponseDto> {
    return this.paymentService.initiatePayment(userId, dto);
  }

  /**
   * POST /payments/callback/iyzico - Iyzico webhook
   */
  @Post('callback/iyzico')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iyzico payment callback (webhook)' })
  async iyzicoCallback(@Body() dto: IyzicoCallbackDto) {
    return this.paymentService.handleIyzicoCallback(dto);
  }

  /**
   * POST /payments/callback/paytr - PayTR webhook
   */
  @Post('callback/paytr')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PayTR payment callback (webhook)' })
  async paytrCallback(@Body() dto: PayTRCallbackDto) {
    return this.paymentService.handlePayTRCallback(dto);
  }

  // ============================================================
  // PAYMENT METHODS - Must be BEFORE :id routes
  // ============================================================

  /**
   * GET /payments/methods - Get user's saved payment methods
   */
  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get saved payment methods' })
  async getPaymentMethods(@CurrentUser('id') userId: string) {
    return this.paymentService.getPaymentMethods(userId);
  }

  /**
   * POST /payments/methods - Add new payment method
   */
  @Post('methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add new payment method' })
  async addPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: { cardNumber: string; cardHolder: string; expiryMonth: number; expiryYear: number; cvv: string },
  ) {
    return this.paymentService.addPaymentMethod(userId, dto);
  }

  /**
   * DELETE /payments/methods/:id - Delete payment method
   */
  @Delete('methods/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async deletePaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentService.deletePaymentMethod(userId, id);
  }

  /**
   * PATCH /payments/methods/:id/default - Set as default payment method
   */
  @Patch('methods/:id/default')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set default payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async setDefaultPaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.paymentService.setDefaultPaymentMethod(userId, id);
  }

  // ============================================================
  // HOLDS - Must be BEFORE :id routes  
  // ============================================================

  /**
   * GET /payments/holds/me - Get seller's payment holds
   */
  @Get('holds/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current seller\'s payment holds' })
  async getMyHolds(@CurrentUser('id') userId: string): Promise<PaymentHoldResponseDto[]> {
    return this.paymentService.getSellerHolds(userId);
  }

  // ============================================================
  // GENERIC :id routes - Must be LAST
  // ============================================================

  /**
   * GET /payments/:id - Get payment details
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment details' })
  @ApiParam({ name: 'id', description: 'Payment ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.findOne(id, userId);
  }
}
