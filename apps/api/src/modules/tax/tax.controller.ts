/**
 * Public tax calculation API for website (checkout preview, cart).
 */
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TaxService } from './tax.service';

@ApiTags('tax')
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Public()
  @Get('calculate')
  @ApiOperation({ summary: 'Get applicable tax rate for a location and optional category' })
  @ApiQuery({ name: 'countryCode', required: false, description: 'ISO 3166-1 alpha-2 (e.g. TR)' })
  @ApiQuery({ name: 'regionCode', required: false, description: 'Region/state code (e.g. 34)' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Product category ID for category-specific rate' })
  @ApiQuery({ name: 'subtotal', required: false, description: 'Subtotal to compute tax amount' })
  @ApiResponse({ status: 200, description: 'Resolved tax rate and optional tax amount' })
  async calculate(
    @Query('countryCode') countryCode?: string,
    @Query('regionCode') regionCode?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subtotal') subtotalStr?: string,
  ) {
    const resolved = await this.taxService.resolveTaxRate(
      countryCode || 'TR',
      regionCode || null,
      categoryId || null,
    );
    const subtotal = subtotalStr != null ? parseFloat(subtotalStr) : undefined;
    const taxAmount =
      resolved != null && subtotal != null && !Number.isNaN(subtotal)
        ? this.taxService.calculateTaxAmount(subtotal, resolved)
        : undefined;
    return {
      rate: resolved ? resolved.rate : null,
      name: resolved ? resolved.name : null,
      taxRateId: resolved ? resolved.taxRateId : null,
      ...(taxAmount !== undefined && { taxAmount }),
    };
  }
}
