import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ManufacturerService } from './manufacturer.service';
import { Public } from '../auth/decorators';

@ApiTags('manufacturers')
@Controller('manufacturers')
export class ManufacturerController {
  constructor(private readonly manufacturerService: ManufacturerService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Üretici listesi' })
  @ApiResponse({ status: 200, description: 'Tüm aktif üreticiler' })
  async findAll() {
    return this.manufacturerService.findAll();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Üretici detayı (ID)' })
  @ApiParam({ name: 'id', description: 'Manufacturer ID' })
  @ApiResponse({ status: 200, description: 'Üretici detayı' })
  @ApiResponse({ status: 404, description: 'Üretici bulunamadı' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.manufacturerService.findOne(id);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Üretici detayı (slug)' })
  @ApiParam({ name: 'slug', description: 'Manufacturer slug' })
  @ApiResponse({ status: 200, description: 'Üretici detayı' })
  @ApiResponse({ status: 404, description: 'Üretici bulunamadı' })
  async findBySlug(@Param('slug') slug: string) {
    return this.manufacturerService.findBySlug(slug);
  }
}
