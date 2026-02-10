import {
    Controller,
    Get,
    Param,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { CarModelService } from './car-model.service';
import { Public } from '../auth/decorators';

@ApiTags('car-models')
@Controller('car-models')
export class CarModelController {
    constructor(private readonly carModelService: CarModelService) { }

    /**
     * GET /car-models?brand=bmw
     * Get all active car models, optionally filtered by brand slug
     */
    @Get()
    @Public()
    @ApiOperation({ summary: 'Tüm araba modellerini listele' })
    @ApiQuery({ name: 'brand', required: false, description: 'Filter by brand slug' })
    @ApiResponse({ status: 200, description: 'Araba model listesi' })
    async findAll(@Query('brand') brandSlug?: string) {
        return this.carModelService.findAll(brandSlug);
    }

    /**
     * GET /car-models/:slug
     * Get car model by slug
     */
    @Get(':slug')
    @Public()
    @ApiOperation({ summary: 'Model detayı (slug ile)' })
    @ApiParam({ name: 'slug', description: 'Car model slug (e.g. bmw-m3-e30)' })
    @ApiResponse({ status: 200, description: 'Model detayı' })
    @ApiResponse({ status: 404, description: 'Model bulunamadı' })
    async findBySlug(@Param('slug') slug: string) {
        return this.carModelService.findBySlug(slug);
    }
}
