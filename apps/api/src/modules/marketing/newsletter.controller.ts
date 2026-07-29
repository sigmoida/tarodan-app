import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { NewsletterService } from './newsletter.service';
import { NewsletterSubscribeDto } from './dto/newsletter-subscribe.dto';

@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bültene abone ol (misafir)' })
  @ApiResponse({ status: 200, description: 'Abonelik başarılı' })
  async subscribe(@Body() dto: NewsletterSubscribeDto) {
    return this.newsletterService.subscribe(dto);
  }

  @Get('unsubscribe')
  @Public()
  @ApiOperation({ summary: 'Token ile abonelikten çık (e-posta linki)' })
  @ApiResponse({ status: 200, description: 'Abonelik iptal edildi' })
  @ApiResponse({ status: 404, description: 'Geçersiz token' })
  async unsubscribeByToken(@Query('token') token: string) {
    if (!token?.trim()) {
      return { message: 'Token gerekli.', success: false };
    }
    return this.newsletterService.unsubscribeByToken(token.trim());
  }

  @Post('unsubscribe')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E-posta ile abonelikten çık' })
  @ApiResponse({ status: 200, description: 'Abonelik iptal edildi' })
  async unsubscribeByEmail(@Body('email') email: string) {
    if (!email?.trim()) {
      return { message: 'E-posta adresi gerekli.', success: false };
    }
    return this.newsletterService.unsubscribeByEmail(email);
  }
}
