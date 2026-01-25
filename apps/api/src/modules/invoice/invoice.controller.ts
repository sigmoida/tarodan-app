import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { JwtPayload } from '../auth/interfaces';

@ApiTags('invoices')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /**
   * Get invoices for current user
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user invoices' })
  async getUserInvoices(
    @CurrentUser() user: JwtPayload,
    @Query('type') type: 'buyer' | 'seller' = 'buyer',
  ) {
    return this.invoiceService.getUserInvoices(user.sub, type);
  }

  /**
   * Get invoice by order ID
   */
  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invoice by order ID' })
  async getByOrderId(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoiceService.getByOrderId(orderId, user.sub);
  }

  /**
   * Generate invoice for order (admin or system use)
   */
  @Post('generate/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate invoice for order' })
  async generateInvoice(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.invoiceService.generateForOrder(orderId);
  }
}
