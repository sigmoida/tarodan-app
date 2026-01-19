import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard, CurrentUser } from '../auth';
import { UpdateProfileDto, CreateAddressDto, UpdateAddressDto } from './dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /users/me
   * Get current user profile with addresses
   */
  @Get('me')
  @ApiOperation({ summary: 'Mevcut kullanıcı bilgileri' })
  @ApiResponse({ status: 200, description: 'Kullanıcı bilgileri' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.userService.findByIdWithAddresses(userId);
  }

  /**
   * PATCH /users/me
   * Update current user profile
   */
  @Patch('me')
  @ApiOperation({ summary: 'Profil güncelle' })
  @ApiResponse({ status: 200, description: 'Profil güncellendi' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * POST /users/me/seller
   * Upgrade to seller account
   */
  @Post('me/seller')
  @ApiOperation({ summary: 'Satıcı hesabına yükselt' })
  @ApiResponse({ status: 200, description: 'Satıcı hesabına yükseltildi' })
  async upgradeToSeller(@CurrentUser('id') userId: string) {
    return this.userService.upgradToSeller(userId);
  }

  /**
   * GET /users/me/addresses
   * Get current user's addresses
   */
  @Get('me/addresses')
  @ApiOperation({ summary: 'Adreslerim' })
  @ApiResponse({ status: 200, description: 'Adres listesi' })
  async getAddresses(@CurrentUser('id') userId: string) {
    return this.userService.getAddresses(userId);
  }

  /**
   * POST /users/me/addresses
   * Add new address
   */
  @Post('me/addresses')
  @ApiOperation({ summary: 'Yeni adres ekle' })
  @ApiResponse({ status: 201, description: 'Adres eklendi' })
  async addAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.userService.addAddress(userId, dto);
  }

  /**
   * PATCH /users/me/addresses/:id
   * Update address
   */
  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Adres güncelle' })
  @ApiResponse({ status: 200, description: 'Adres güncellendi' })
  async updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.userService.updateAddress(userId, addressId, dto);
  }

  /**
   * DELETE /users/me/addresses/:id
   * Delete address
   */
  @Delete('me/addresses/:id')
  @ApiOperation({ summary: 'Adres sil' })
  @ApiResponse({ status: 200, description: 'Adres silindi' })
  async deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.userService.deleteAddress(userId, addressId);
  }

  /**
   * GET /users/me/following
   * Get users that current user is following
   */
  @Get('me/following')
  @ApiOperation({ summary: 'Takip ettiklerim' })
  @ApiResponse({ status: 200, description: 'Takip edilen kullanıcılar' })
  async getFollowing(@CurrentUser('id') userId: string) {
    return this.userService.getFollowing(userId);
  }

  /**
   * GET /users/:id/profile
   * Get public user profile
   */
  @Get(':id/profile')
  @ApiOperation({ summary: 'Kullanıcı profili görüntüle' })
  @ApiResponse({ status: 200, description: 'Kullanıcı profili' })
  async getUserProfile(@Param('id') userId: string) {
    return this.userService.getPublicProfile(userId);
  }

  /**
   * POST /users/:id/follow
   * Follow a user
   */
  @Post(':id/follow')
  @ApiOperation({ summary: 'Kullanıcıyı takip et' })
  @ApiResponse({ status: 200, description: 'Takip edildi' })
  async followUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.followUser(currentUserId, targetUserId);
  }

  /**
   * DELETE /users/:id/follow
   * Unfollow a user
   */
  @Delete(':id/follow')
  @ApiOperation({ summary: 'Takibi bırak' })
  @ApiResponse({ status: 200, description: 'Takip bırakıldı' })
  async unfollowUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.userService.unfollowUser(currentUserId, targetUserId);
  }
}
