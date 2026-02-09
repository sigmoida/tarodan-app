import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiProduces } from '@nestjs/swagger';
import { Response } from 'express';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser, Public } from '../auth/decorators';
import { JwtPayload } from '../auth/interfaces';

@ApiTags('invoices')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) { }

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
   * Get invoice by order ID (Authenticated)
   */
  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invoice by order ID' })
  async getByOrderId(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: JwtPayload,
    @Query('paymentId') paymentId?: string,
  ) {
    return this.invoiceService.getByOrderId(orderId, user.sub, paymentId);
  }

  /**
   * Get invoice by order ID - PUBLIC (For guests, requires paymentId verification)
   */
  @Get('order/:orderId/public')
  @Public()
  @ApiOperation({ summary: 'Get invoice by order ID (Public/Guest with paymentId verification)' })
  async getByOrderIdPublic(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('paymentId') paymentId: string,
  ) {
    if (!paymentId) {
      throw new BadRequestException('paymentId gereklidir');
    }
    return this.invoiceService.getByOrderId(orderId, null, paymentId);
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

  /**
   * Download invoice PDF by invoice ID (Authenticated)
   */
  @Get('download/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download invoice as PDF' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: HttpStatus.OK, description: 'PDF file stream' })
  async downloadInvoice(
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
    @Query('paymentId') paymentId?: string,
  ) {
    const pdfBuffer = await this.invoiceService.downloadInvoice(invoiceId, user.sub, paymentId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="fatura-${invoiceId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Download invoice PDF by invoice ID - PUBLIC (For guests, requires paymentId verification)
   */
  @Get('download/:id/public')
  @Public()
  @ApiOperation({ summary: 'Download invoice as PDF (Public/Guest with paymentId verification)' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: HttpStatus.OK, description: 'PDF file stream' })
  async downloadInvoicePublic(
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @Query('paymentId') paymentId: string,
    @Res() res: Response,
  ) {
    if (!paymentId) {
      throw new BadRequestException('paymentId gereklidir');
    }
    const pdfBuffer = await this.invoiceService.downloadInvoice(invoiceId, null, paymentId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="fatura-${invoiceId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.status(HttpStatus.OK).send(pdfBuffer);
  }
}
