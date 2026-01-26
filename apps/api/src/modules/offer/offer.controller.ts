import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { OfferService } from './offer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateOfferDto,
  CounterOfferDto,
  OfferQueryDto,
  OfferResponseDto,
  PaginatedOffersDto,
} from './dto';

@ApiTags('offers')
@Controller('offers')
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  /**
   * POST /offers - Create a new offer
   * Requirement: Create offer (project.md)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new offer on a product' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Offer created successfully',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid data or offer not allowed',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Product not found',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOfferDto,
  ): Promise<OfferResponseDto> {
    return this.offerService.create(userId, dto);
  }

  /**
   * GET /offers/pending-count - Get pending offers count for badge
   */
  @Get('pending-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get count of pending offers (received)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pending offers count',
    schema: {
      type: 'object',
      properties: {
        received: { type: 'number', description: 'Pending offers received' },
        sent: { type: 'number', description: 'Pending offers sent' },
        total: { type: 'number', description: 'Total pending offers' },
      },
    },
  })
  async getPendingCount(@CurrentUser('id') userId: string) {
    return this.offerService.getPendingCount(userId);
  }

  /**
   * GET /offers - Get user's offers
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s offers (sent and received)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of offers',
    type: PaginatedOffersDto,
  })
  async findUserOffers(
    @CurrentUser('id') userId: string,
    @Query() query: OfferQueryDto,
  ): Promise<PaginatedOffersDto> {
    return this.offerService.findUserOffers(userId, query);
  }

  /**
   * GET /offers/:id - Get single offer
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific offer by ID' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Offer details',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Offer not found',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OfferResponseDto> {
    return this.offerService.findOne(id, userId);
  }

  /**
   * POST /offers/:id/accept - Accept offer
   * Requirement: Accept/reject offer (project.md)
   */
  @Post(':id/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an offer (seller only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Offer accepted',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Offer cannot be accepted',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to accept this offer',
  })
  async accept(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OfferResponseDto> {
    return this.offerService.accept(id, userId);
  }

  /**
   * POST /offers/:id/reject - Reject offer
   * Requirement: Accept/reject offer (project.md)
   */
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an offer (seller only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Offer rejected',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Offer cannot be rejected',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to reject this offer',
  })
  async reject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OfferResponseDto> {
    return this.offerService.reject(id, userId);
  }

  /**
   * POST /offers/:id/counter - Counter-offer
   * Requirement: Counter-offer (project.md)
   */
  @Post(':id/counter')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make a counter-offer (seller only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Counter-offer created',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Counter-offer not allowed',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to counter this offer',
  })
  async counter(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CounterOfferDto,
  ): Promise<OfferResponseDto> {
    return this.offerService.counter(id, userId, dto);
  }

  /**
   * POST /offers/:id/cancel - Cancel offer (buyer only)
   */
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an offer (buyer only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Offer cancelled',
    type: OfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Offer cannot be cancelled',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to cancel this offer',
  })
  async cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<OfferResponseDto> {
    return this.offerService.cancel(id, userId);
  }

  /**
   * GET /offers/product/:productId - Get offers for a product
   */
  @Get('product/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all offers for a specific product (seller only)' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of offers for the product',
    type: PaginatedOffersDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not authorized to view these offers',
  })
  async findProductOffers(
    @Param('productId') productId: string,
    @CurrentUser('id') userId: string,
    @Query() query: OfferQueryDto,
  ): Promise<PaginatedOffersDto> {
    return this.offerService.findProductOffers(productId, userId, query);
  }
}
