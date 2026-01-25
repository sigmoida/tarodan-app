import {
  Controller,
  Get,
  Post,
  Query,
  Param,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchService, SearchOptions, SearchResponse } from './search.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Search products (public)
   * GET /search/products
   */
  @Public()
  @Get('products')
  async searchProducts(
    @Query('q') query: string,
    @Query('categoryId') categoryId?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('condition') condition?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest',
  ): Promise<SearchResponse> {
    const options: SearchOptions = {
      query: query || '',
      categoryId,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      condition,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      sortBy,
    };

    return this.searchService.searchProducts(options);
  }

  /**
   * Autocomplete suggestions (public)
   * GET /search/autocomplete
   */
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

  /**
   * Reindex all products (Admin)
   * POST /search/admin/reindex
   */
  @Post('admin/reindex')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async reindexAll(): Promise<{ indexed: number }> {
    const indexed = await this.searchService.reindexAll();
    return { indexed };
  }

  /**
   * Index a single product (Admin)
   * POST /search/admin/index/:productId
   */
  @Post('admin/index/:productId')
  @Roles(AdminRole.admin, AdminRole.super_admin)
  async indexProduct(
    @Param('productId') productId: string,
  ): Promise<{ success: boolean }> {
    await this.searchService.indexProduct(productId);
    return { success: true };
  }

  /**
   * Reindex all products (Development only)
   * GET /search/dev/reindex
   * Only works in development mode for easy testing
   */
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
      message: `${indexed} ürün Elasticsearch'e index'lendi. Artık "hotw" veya "hxt wheels" gibi aramalar çalışacak.` 
    };
  }

  /**
   * Get search index status
   * GET /search/status
   */
  @Public()
  @Get('status')
  async getStatus(): Promise<{ 
    elasticsearch: boolean; 
    indexExists: boolean;
    documentCount: number;
    message: string;
  }> {
    try {
      // This will test if ES is reachable and index exists
      const result = await this.searchService.searchProducts({ 
        query: '', 
        page: 1, 
        pageSize: 1 
      });
      
      return {
        elasticsearch: true,
        indexExists: true,
        documentCount: result.total,
        message: result.total > 0 
          ? `Elasticsearch çalışıyor, ${result.total} ürün index'li` 
          : 'Elasticsearch çalışıyor ama index boş. /search/dev/reindex çağırın.',
      };
    } catch (error) {
      return {
        elasticsearch: false,
        indexExists: false,
        documentCount: 0,
        message: `Elasticsearch bağlantı hatası: ${error.message}`,
      };
    }
  }
}
