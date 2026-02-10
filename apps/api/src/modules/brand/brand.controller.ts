import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { Public } from '../auth/decorators';

@ApiTags('brands')
@Controller('brands')
export class BrandController {
    constructor(private readonly brandService: BrandService) { }

    /**
     * GET /brands
     * Get all active brands with product counts
     */
    @Get()
    @Public()
    @ApiOperation({ summary: 'Tüm markaları listele' })
    @ApiResponse({
        status: 200,
        description: 'Aktif marka listesi (ürün sayılarıyla)',
    })
    async findAll() {
        return this.brandService.findAll();
    }

    /**
     * GET /brands/:slug
     * Get brand by slug (for /brands/[slug] page)
     */
    @Get(':slug')
    @Public()
    @ApiOperation({ summary: 'Marka detayı (slug ile)' })
    @ApiParam({ name: 'slug', description: 'Brand slug (e.g. minichamps)' })
    @ApiResponse({ status: 200, description: 'Marka detayı' })
    @ApiResponse({ status: 404, description: 'Marka bulunamadı' })
    async findBySlug(@Param('slug') slug: string) {
        return this.brandService.findBySlug(slug);
    }
}
