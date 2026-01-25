import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { MembershipService } from '../membership/membership.service';

// Sharp is optional - image resizing will be skipped if not available
let sharp: any;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

export interface UploadOptions {
  bucket?: string;
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
  url: string;
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly minioClient: Minio.Client;
  private readonly defaultBucket: string;

  constructor(
    private configService: ConfigService,
    private membershipService: MembershipService,
  ) {
    const portStr = this.configService.get<string>('MINIO_PORT') || '9000';
    const port = parseInt(portStr, 10);
    
    // Parse useSSL as boolean - env vars come as strings
    const useSSLStr = this.configService.get<string>('MINIO_USE_SSL') || 'false';
    const useSSL = useSSLStr === 'true' || useSSLStr === '1';
    
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
      port: port,
      useSSL: useSSL,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY') || 'minioadmin',
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY') || 'minioadmin',
    });

    this.defaultBucket = this.configService.get<string>('MINIO_BUCKET') || 'tarodan';
    this.ensureBucket();
  }

  private async ensureBucket(): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(this.defaultBucket);
      if (!exists) {
        await this.minioClient.makeBucket(this.defaultBucket);
        this.logger.log(`Bucket '${this.defaultBucket}' created`);

        // Set bucket policy for public read
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.defaultBucket}/*`],
            },
          ],
        };
        await this.minioClient.setBucketPolicy(this.defaultBucket, JSON.stringify(policy));
      }
    } catch (error) {
      this.logger.error(`Failed to ensure bucket: ${error.message}`);
    }
  }

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
    const key = `${folder}/${filename}`;

    try {
      let buffer = file.buffer;

      // Process image if resize options provided and sharp is available
      if (resize && file.mimetype.startsWith('image/') && sharp) {
        buffer = await sharp(buffer)
          .resize(resize.width, resize.height, { fit: resize.fit || 'cover' })
          .toBuffer();
      }

      // Upload main file
      await this.minioClient.putObject(bucket, key, buffer, buffer.length, {
        'Content-Type': file.mimetype,
      });

      const url = this.getPublicUrl(bucket, key);
      const result: UploadResult = {
        url,
        key,
        bucket,
        size: buffer.length,
        mimeType: file.mimetype,
      };

      // Generate thumbnail if requested and sharp is available
      if (generateThumbnail && file.mimetype.startsWith('image/') && sharp) {
        const thumbBuffer = await sharp(file.buffer)
          .resize(200, 200, { fit: 'cover' })
          .toBuffer();

        const thumbKey = `${folder}/thumbnails/${filename}`;
        await this.minioClient.putObject(bucket, thumbKey, thumbBuffer, thumbBuffer.length, {
          'Content-Type': file.mimetype,
        });

        result.thumbnail = this.getPublicUrl(bucket, thumbKey);
      }

      this.logger.log(`File uploaded: ${key}`);
      return result;
    } catch (error) {
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
      await this.minioClient.removeObject(bucket, key);
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Delete failed: ${error.message}`);
      throw new BadRequestException('File deletion failed');
    }
  }

  async deleteMultiple(keys: string[], bucket: string = this.defaultBucket): Promise<void> {
    try {
      await this.minioClient.removeObjects(bucket, keys);
      this.logger.log(`Files deleted: ${keys.length} items`);
    } catch (error) {
      this.logger.error(`Bulk delete failed: ${error.message}`);
      throw new BadRequestException('Bulk file deletion failed');
    }
  }

  async getPresignedUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600
  ): Promise<string> {
    return this.minioClient.presignedGetObject(bucket, key, expiry);
  }

  async getPresignedUploadUrl(
    key: string,
    bucket: string = this.defaultBucket,
    expiry: number = 3600
  ): Promise<string> {
    return this.minioClient.presignedPutObject(bucket, key, expiry);
  }

  private getPublicUrl(bucket: string, key: string): string {
    const endpoint = this.configService.get<string>('MINIO_PUBLIC_URL') ||
      `http://${this.configService.get<string>('MINIO_ENDPOINT')}:${this.configService.get<number>('MINIO_PORT')}`;
    return `${endpoint}/${bucket}/${key}`;
  }

  async copyFile(
    sourceKey: string,
    destKey: string,
    sourceBucket: string = this.defaultBucket,
    destBucket: string = this.defaultBucket
  ): Promise<void> {
    try {
      const copySource = `/${sourceBucket}/${sourceKey}`;
      const conditions = new Minio.CopyConditions();
      await this.minioClient.copyObject(destBucket, destKey, copySource, conditions);
      this.logger.log(`File copied from ${sourceKey} to ${destKey}`);
    } catch (error: any) {
      this.logger.error(`Copy failed: ${error.message}`);
      throw new BadRequestException('File copy failed');
    }
  }

  async getFileInfo(key: string, bucket: string = this.defaultBucket): Promise<Minio.BucketItemStat> {
    return this.minioClient.statObject(bucket, key);
  }
}
