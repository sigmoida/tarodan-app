import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Upload single file
   * POST /storage/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Request() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp|pdf)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('bucket') bucket?: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets',
    @Body('folder') folder?: string,
    @Body('entityType') entityType?: string,
    @Body('entityId') entityId?: string,
  ) {
    return this.storageService.uploadFile(
      file.buffer,
      {
        bucket: (bucket || 'documents') as 'products' | 'avatars' | 'documents' | 'collections' | 'tickets',
        folder,
        filename: file.originalname,
        mimeType: file.mimetype,
        entityType,
        entityId,
      },
      req.user.id,
    );
  }

  /**
   * Upload product images
   * POST /storage/products/:productId/images
   */
  @Post('products/:productId/images')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadProductImages(
    @Request() req: any,
    @Param('productId') productId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Validate images
    for (const file of files) {
      const validation = await this.storageService.validateProductImage(file.buffer);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }
    }

    return this.storageService.uploadFiles(
      files.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        filename: f.originalname,
      })),
      {
        bucket: 'products',
        folder: productId,
        entityType: 'product',
        entityId: productId,
        isPublic: true,
      },
      req.user.id,
    );
  }

  /**
   * Upload avatar
   * POST /storage/avatar
   */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.storageService.uploadFile(
      file.buffer,
      {
        bucket: 'avatars',
        folder: req.user.id,
        mimeType: file.mimetype,
        entityType: 'user',
        entityId: req.user.id,
        isPublic: true,
      },
      req.user.id,
    );
  }

  /**
   * Get presigned upload URL
   * POST /storage/presigned-url
   */
  @Post('presigned-url')
  async getPresignedUploadUrl(
    @Body('bucket') bucket: string,
    @Body('key') key: string,
    @Body('expiry') expiry?: number,
  ) {
    const url = await this.storageService.getPresignedUploadUrl(
      bucket,
      key,
      expiry,
    );
    return { url };
  }

  /**
   * Get presigned download URL for file access
   * GET /storage/presigned/:bucket/*
   */
  @Get('presigned/:bucket/*')
  async getPresignedDownloadUrl(
    @Param('bucket') bucket: string,
    @Param() params: any,
    @Query('expiry') expiry?: number,
  ) {
    const key = params['0'];
    const url = await this.storageService.getPresignedDownloadUrl(
      bucket,
      key,
      expiry ? parseInt(expiry.toString()) : 3600,
    );
    return { url, expiresIn: expiry || 3600 };
  }

  /**
   * Delete file
   * DELETE /storage/:bucket/:key
   */
  @Delete(':bucket/*')
  async deleteFile(
    @Param('bucket') bucket: string,
    @Param() params: any,
  ) {
    // Extract key from wildcard param
    const key = params['0'];
    await this.storageService.deleteFile(bucket, key);
    return { success: true };
  }

  /**
   * Get files by entity with presigned URLs
   * GET /storage/entity/:entityType/:entityId?includeUrls=true&expiry=3600
   */
  @Get('entity/:entityType/:entityId')
  async getFilesByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('includeUrls') includeUrls?: string,
    @Query('expiry') expiry?: number,
  ) {
    return this.storageService.getFilesByEntity(
      entityType,
      entityId,
      includeUrls !== 'false', // Default true
      expiry ? parseInt(expiry.toString()) : 3600,
    );
  }
}
