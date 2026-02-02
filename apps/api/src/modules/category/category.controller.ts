import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { Public, Roles } from '../auth/decorators';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  /**
   * GET /categories
   * Get all categories (hierarchical)
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Kategori listesi' })
  @ApiResponse({
    status: 200,
    description: 'Kategori listesi (hiyerarşik)',
  })
  async findAll() {
    return this.categoryService.findAll();
  }

  /**
   * GET /categories/:id
   * Get category by ID
   */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Kategori detayı (ID ile)' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiResponse({ status: 200, description: 'Kategori detayı' })
  @ApiResponse({ status: 404, description: 'Kategori bulunamadı' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.findOne(id);
  }

  /**
   * GET /categories/slug/:slug
   * Get category by slug
   */
  @Get('slug/:slug')
  @Public()
  @ApiOperation({ summary: 'Kategori detayı (slug ile)' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  @ApiResponse({ status: 200, description: 'Kategori detayı' })
  @ApiResponse({ status: 404, description: 'Kategori bulunamadı' })
  async findBySlug(@Param('slug') slug: string) {
    return this.categoryService.findBySlug(slug);
  }

  /**
   * POST /categories
   * Create new category
   */
  @Post()
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yeni kategori oluştur' })
  @ApiResponse({ status: 201, description: 'Kategori oluşturuldu' })
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  /**
   * PATCH /categories/:id
   * Update category
   */
  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kategori güncelle' })
  @ApiResponse({ status: 200, description: 'Kategori güncellendi' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  /**
   * DELETE /categories/:id
   * Delete category
   */
  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kategori sil' })
  @ApiResponse({ status: 200, description: 'Kategori silindi' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.remove(id);
  }
}
