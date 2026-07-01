import {
  Controller,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SellerInvoiceService } from './seller-invoice.service';

/**
 * Kurumsal satıcının siparişe ürün faturası (PDF) yüklemesi + alıcı/satıcının indirmesi.
 * Sipariş başına tek fatura; POST tekrar yüklendiğinde değiştirir.
 */
@ApiTags('seller-invoice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders/:id/seller-invoice')
export class SellerInvoiceController {
  constructor(private readonly sellerInvoice: SellerInvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Kurumsal satıcı: siparişe fatura PDF yükle/değiştir (alıcıya mail gider)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Fatura PDF dosyası gerekli (form-data alanı: file)');
    return this.sellerInvoice.uploadForOrder(orderId, userId, file);
  }

  @Get()
  @ApiOperation({ summary: 'Siparişin yüklenmiş satıcı faturası durumu + yükleme yetkisi' })
  async status(@Param('id', ParseUUIDPipe) orderId: string, @CurrentUser('id') userId: string) {
    return this.sellerInvoice.getForOrder(orderId, userId);
  }

  @Get('download')
  @ApiOperation({ summary: 'Satıcı faturası PDF indirme (presigned URL)' })
  async download(@Param('id', ParseUUIDPipe) orderId: string, @CurrentUser('id') userId: string) {
    return this.sellerInvoice.getDownloadUrl(orderId, userId);
  }
}
