import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PagesService } from './pages.service';

@ApiTags('pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published static pages (public, for sitemap)' })
  async list() {
    return this.pagesService.findAllPublished();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get static page by slug (public)' })
  @ApiParam({ name: 'slug', example: 'about' })
  async getBySlug(@Param('slug') slug: string) {
    return this.pagesService.findBySlug(slug);
  }
}
