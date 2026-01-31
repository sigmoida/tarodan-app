import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AdvertisementService } from './advertisement.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('ads')
@Controller('ads')
@Public()
export class AdvertisementController {
  constructor(private readonly advertisementService: AdvertisementService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get active ads for display (public)' })
  @ApiQuery({ name: 'position', required: false, description: 'Filter by position: header, sidebar, footer, inline, popup' })
  @ApiQuery({ name: 'device', required: false, description: 'Filter by device: desktop, mobile, all' })
  getActive(
    @Query('position') position?: string,
    @Query('device') deviceType?: string,
  ) {
    return this.advertisementService.getActive(position, deviceType);
  }

  @Get('iab-sizes')
  @ApiOperation({ summary: 'Get IAB standard ad sizes' })
  getIABSizes() {
    return this.advertisementService.getIABSizes();
  }

  @Post(':id/click')
  @ApiOperation({ summary: 'Record ad click (public)' })
  @ApiParam({ name: 'id', description: 'Ad ID' })
  recordClick(@Param('id') id: string) {
    return this.advertisementService.recordClick(id);
  }

  @Post(':id/impression')
  @ApiOperation({ summary: 'Record ad impression (public)' })
  @ApiParam({ name: 'id', description: 'Ad ID' })
  recordImpression(@Param('id') id: string) {
    return this.advertisementService.recordImpression(id);
  }
}
