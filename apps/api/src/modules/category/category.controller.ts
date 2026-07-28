import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { AdminRoute } from '../auth/decorators/admin-route.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  /**
   * GET /categories
   * Get all categories (hierarchical). ?refresh=1 invalidates cache and returns fresh data.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Kategori listesi' })
  @ApiResponse({
    status: 200,
    description: 'Kategori listesi (hiyerarşik)',
  })
  async findAll(@Query('refresh') refresh?: string) {
    if (refresh === '1') {
      await this.categoryService.invalidateCache();
    }
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
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @RequirePermission('categories')
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
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @RequirePermission('categories')
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
  @AdminRoute()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @RequirePermission('categories')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kategori sil' })
  @ApiResponse({ status: 200, description: 'Kategori silindi' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.remove(id);
  }
}
