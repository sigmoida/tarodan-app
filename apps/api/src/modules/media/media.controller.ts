import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaService, UploadOptions, UploadResult } from './media.service';
import { MembershipService } from '../membership/membership.service';
import { StorageService } from '../storage/storage.service';
import { ModerationAiClient } from '../moderation/moderation-ai.client';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly membershipService: MembershipService,
    private readonly storageService: StorageService,
    private readonly moderationAi: ModerationAiClient,
  ) {}

  /** Mesaj görselini (dosyanın kendisini) AI ile NSFW denetle — uygunsuzsa yüklemeyi engelle. */
  private async assertCleanImageFile(file: Express.Multer.File): Promise<void> {
    if (
      !this.moderationAi.isEnabled ||
      !file?.buffer ||
      !file.mimetype?.startsWith('image/')
    ) {
      return;
    }
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const verdict = await this.moderationAi.moderateImage(dataUri);
    if (verdict?.decision === 'flag') {
      throw new BadRequestException(
        'Yüklediğiniz resim uygun değildir. Lütfen uygun bir görsel seçin.',
      );
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
    @Query('resize') resize?: string,
    @Query('thumbnail') thumbnail?: string
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Mesaj görseli ise dosyanın kendisini AI ile denetle (uygunsuz/NSFW → engelle)
    if ((folder || '') === 'messages') {
      await this.assertCleanImageFile(file);
    }

    const options: UploadOptions = {
      folder: folder || 'uploads',
      generateThumbnail: thumbnail === 'true',
    };

    if (resize) {
      const [width, height] = resize.split('x').map(Number);
      if (width && height) {
        options.resize = { width, height };
      }
    }

    return this.mediaService.upload(file, options);
  }

  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder?: string,
    @Query('thumbnail') thumbnail?: string
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const options: UploadOptions = {
      folder: folder || 'uploads',
      generateThumbnail: thumbnail === 'true',
    };

    return this.mediaService.uploadMultiple(files, options);
  }

  @Post('upload/product')
  @UseInterceptors(FilesInterceptor('images', 15))
  async uploadProductImages(
    @Request() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Query('productId') productId?: string,
  ): Promise<Array<{ cardKey: string; detailKey: string; cardUrl: string; detailUrl: string }>> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const membership = await this.membershipService.getUserMembership(req.user.id);
    const maxImages = membership.tier.maxImagesPerListing;

    if (files.length > maxImages) {
      throw new BadRequestException(`En fazla ${maxImages} resim yükleyebilirsiniz`);
    }

    const results = await Promise.all(
      files.map((file) => this.mediaService.uploadProductImageVariants(file, productId)),
    );
    return results.map((r) => ({
      cardKey: r.cardKey,
      detailKey: r.detailKey,
      cardUrl: this.storageService.getPublicAssetUrl(r.cardKey),
      detailUrl: this.storageService.getPublicAssetUrl(r.detailKey),
    }));
  }

  @Post('upload/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.mediaService.upload(file, {
      folder: 'avatars',
      resize: { width: 300, height: 300, fit: 'cover' },
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxSize: 2 * 1024 * 1024, // 2MB
    });
  }

  @Delete(':key')
  async deleteFile(@Param('key') key: string): Promise<{ success: boolean }> {
    await this.mediaService.delete(key);
    return { success: true };
  }

  @Get('presigned/:key')
  async getPresignedUrl(
    @Param('key') key: string,
    @Query('expiry') expiry?: number
  ): Promise<{ url: string }> {
    const url = await this.mediaService.getPresignedUrl(key, undefined, expiry || 3600);
    return { url };
  }

  @Get('presigned/upload/:folder/:filename')
  async getPresignedUploadUrl(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Query('expiry') expiry?: number
  ): Promise<{ url: string; key: string }> {
    const key = `${folder}/${filename}`;
    const url = await this.mediaService.getPresignedUploadUrl(key, undefined, expiry || 3600);
    return { url, key };
  }
}
