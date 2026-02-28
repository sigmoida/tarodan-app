import {
  Controller,
  Get,
  Post,
  Query,
  Param,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService, SearchOptions, SearchResponse, RichAutocompleteResult } from './search.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('products')
  async searchProducts(
    @Query('q') query: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('manufacturerId') manufacturerId?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('condition') condition?: string,
    @Query('brand') brand?: string,
    @Query('scale') scale?: string,
    @Query('material') material?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('tradeOnly') tradeOnly?: string,
    @Query('discountOnly') discountOnly?: string,
    @Query('preOrder') preOrder?: string,
    @Query('limited') limited?: string,
    @Query('set') setFilter?: string,
    @Query('vehicleType') vehicleType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
  ): Promise<SearchResponse> {
    const options: SearchOptions = {
      query: query || '',
      categoryId,
      brandId,
      manufacturerId,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      condition,
      brand,
      scale,
      material,
      manufacturer,
      tradeOnly: tradeOnly === 'true',
      discountOnly: discountOnly === 'true',
      preOrder: preOrder === 'true',
      limited: limited === 'true',
      set: setFilter === 'true',
      vehicleType,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      sortBy,
    };

    return this.searchService.searchProducts(options);
  }

  @Public()
  @Get('autocomplete')
  async autocomplete(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<{ suggestions: string[] }> {
    const suggestions = await this.searchService.autocomplete(
      query,
      limit ? parseInt(limit) : 10,
    );
    return { suggestions };
  }

  @Public()
  @Get('autocomplete-rich')
  async autocompleteRich(
    @Query('q') query: string,
  ): Promise<RichAutocompleteResult> {
    return this.searchService.autocompleteRich(query || '');
  }

  @Post('admin/reindex')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async reindexAll(): Promise<{ indexed: number }> {
    const indexed = await this.searchService.reindexAll();
    return { indexed };
  }

  @Post('admin/index/:productId')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async indexProduct(
    @Param('productId') productId: string,
  ): Promise<{ success: boolean }> {
    await this.searchService.indexProduct(productId);
    return { success: true };
  }

  @Public()
  @Get('dev/reindex')
  async devReindex(): Promise<{ indexed: number; message: string }> {
    const isDev = this.configService.get('NODE_ENV') === 'development';
    if (!isDev) {
      return { indexed: 0, message: 'Bu endpoint sadece development modunda çalışır' };
    }
    const indexed = await this.searchService.reindexAll();
    return {
      indexed,
      message: `${indexed} ürün Elasticsearch'e index'lendi.`,
    };
  }

  @Public()
  @Get('status')
  async getStatus() {
    return this.searchService.getStatus();
  }
}
