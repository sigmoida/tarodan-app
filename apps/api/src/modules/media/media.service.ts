import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { MembershipService } from '../membership/membership.service';
import { StorageService, UploadOptions as StorageUploadOptions } from '../storage/storage.service';

// Sharp is optional - image resizing will be skipped if not available
let sharp: any;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

export interface UploadOptions {
  bucket?: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets';
  folder?: string;
  maxSize?: number;
  allowedTypes?: string[];
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
  generateThumbnail?: boolean;
}

export interface UploadResult {
  url?: string; // Deprecated - presigned URL için kullanılmalı
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly defaultBucket: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets' = 'products';

  constructor(
    private configService: ConfigService,
    private membershipService: MembershipService,
    private storageService: StorageService,
  ) {}

  async upload(
    file: Express.Multer.File,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const {
      bucket = this.defaultBucket,
      folder = 'uploads',
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      resize,
      generateThumbnail = false,
    } = options;

    // Validate file size
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${maxSize / 1024 / 1024}MB)`
      );
    }

    // Validate file type
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type '${file.mimetype}' is not allowed`
      );
    }

    // Generate unique filename
    const ext = file.originalname.split('.').pop();
    const filename = `${uuidv4()}.${ext}`;

    try {
      let buffer = file.buffer;

      // Process image if resize options provided and sharp is available
      if (resize && file.mimetype.startsWith('image/') && sharp) {
        buffer = await sharp(buffer)
          .resize(resize.width, resize.height, { fit: resize.fit || 'cover' })
          .toBuffer();
      }

      // Upload main file using StorageService
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        {
          bucket,
          folder,
          filename,
          mimeType: file.mimetype,
        }
      );

      const result: UploadResult = {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        size: uploadResult.size,
        mimeType: uploadResult.mimeType,
      };

      // Generate a presigned download URL so the frontend can preview / store it
      try {
        result.url = await this.storageService.getPresignedDownloadUrl(
          bucket,
          uploadResult.key,
          3600, // 1 hour
        );
      } catch (err: any) {
        this.logger.warn(`Presigned URL generation failed for ${uploadResult.key}: ${err.message}`);
        // Fallback: keep url undefined — frontend should handle this gracefully
      }

      // Generate thumbnail if requested and sharp is available
      if (generateThumbnail && file.mimetype.startsWith('image/') && sharp) {
        const thumbBuffer = await sharp(file.buffer)
          .resize(200, 200, { fit: 'cover' })
          .toBuffer();

        const thumbFilename = `thumb_${filename}`;
        const thumbResult = await this.storageService.uploadFile(
          thumbBuffer,
          {
            bucket,
            folder: `${folder}/thumbnails`,
            filename: thumbFilename,
            mimeType: file.mimetype,
          }
        );

        result.thumbnail = thumbResult.key;
      }

      this.logger.log(`File uploaded: ${uploadResult.key}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException('File upload failed');
    }
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    return Promise.all(files.map((file) => this.upload(file, options)));
  }

  async delete(key: string, bucket: string = this.defaultBucket): Promise<void> {
    try {
      await this.storageService.deleteFile(bucket, key);
      this.logger.log(`File deleted: ${key}`);
    } catch (error: any) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw new BadRequestException('File deletion failed');
    }
  }

  async deleteMultiple(keys: string[], bucket: string = this.defaultBucket): Promise<void> {
    try {
      const files = keys.map(key => ({ bucket, key }));
      await this.storageService.deleteFiles(files);
      this.logger.log(`Files deleted: ${keys.length} items`);
    } catch (error: any) {
      this.logger.error(`Bulk delete failed: ${error.message}`);
      throw new BadRequestException('Bulk file deletion failed');
    }
  }

  async getPresignedUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600
  ): Promise<string> {
    return this.storageService.getPresignedDownloadUrl(bucket, key, expiry);
  }

  async getPresignedUploadUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600
  ): Promise<string> {
    return this.storageService.getPresignedUploadUrl(bucket, key, expiry);
  }

  async uploadBuffer(
    buffer: Buffer,
    options: {
      folder?: string;
      filename?: string;
      mimeType?: string;
      bucket?: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets';
    } = {},
  ): Promise<UploadResult> {
    const bucket = options.bucket || this.defaultBucket;
    const folder = options.folder || 'uploads';
    const filename = options.filename || `${uuidv4()}.jpg`;
    const mimeType = options.mimeType || 'image/jpeg';

    try {
      const uploadResult = await this.storageService.uploadFile(
        buffer,
        {
          bucket,
          folder,
          filename,
          mimeType,
        }
      );

      return {
        key: uploadResult.key,
        bucket: uploadResult.bucket,
        size: uploadResult.size,
        mimeType: uploadResult.mimeType,
      };
    } catch (error: any) {
      this.logger.error(`Buffer upload failed: ${error.message}`);
      throw new BadRequestException('Buffer upload failed');
    }
  }

  async copyFile(
    sourceKey: string,
    destKey: string,
    sourceBucket: string = this.defaultBucket,
    destBucket: string = this.defaultBucket
  ): Promise<void> {
    try {
      // S3'te copy işlemi için önce source'u indir, sonra yeni yere yükle
      const sourcePresignedUrl = await this.storageService.getPresignedDownloadUrl(
        sourceBucket,
        sourceKey,
        3600
      );
      
      // Fetch source file
      const response = await fetch(sourcePresignedUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Get file info from database to get mimeType
      // For now, we'll try to infer from key or use default
      const mimeType = 'application/octet-stream'; // Default
      
      // Upload to destination
      await this.storageService.uploadFile(
        buffer,
        {
          bucket: destBucket as 'products' | 'avatars' | 'documents' | 'collections' | 'tickets',
          folder: destKey.substring(0, destKey.lastIndexOf('/')),
          filename: destKey.substring(destKey.lastIndexOf('/') + 1),
          mimeType,
        }
      );
      
      this.logger.log(`File copied from ${sourceKey} to ${destKey}`);
    } catch (error: any) {
      this.logger.error(`Copy failed: ${error.message}`);
      throw new BadRequestException('File copy failed');
    }
  }

  async getFileInfo(key: string, bucket: string = this.defaultBucket): Promise<{ size: number; lastModified: Date; contentType: string }> {
    // S3'te file info için presigned URL ile HEAD request yapabiliriz
    // Veya database'den bilgi alabiliriz
    // Şimdilik basit bir implementasyon
    try {
      const presignedUrl = await this.storageService.getPresignedDownloadUrl(bucket, key, 60);
      const response = await fetch(presignedUrl, { method: 'HEAD' });
      
      return {
        size: parseInt(response.headers.get('content-length') || '0', 10),
        lastModified: new Date(response.headers.get('last-modified') || Date.now()),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      };
    } catch (error: any) {
      this.logger.error(`Get file info failed: ${error.message}`);
      throw new BadRequestException('Get file info failed');
    }
  }
}
