import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import * as path from 'path';

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  size: number;
  mimeType: string;
}

export interface UploadOptions {
  bucket: string;
  folder?: string;
  filename?: string;
  mimeType?: string;
  isPublic?: boolean;
  entityType?: string;
  entityId?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private minioClient: Minio.Client;
  private readonly buckets = ['products', 'avatars', 'documents', 'collections', 'tickets'];
  private isMinioAvailable = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Initialize MinIO client with correct default credentials from docker-compose.dev.yml
    this.minioClient = new Minio.Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get('MINIO_PORT', '9000')),
      useSSL: this.configService.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'tarodan_minio'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'tarodan_minio_secret_2024'),
    });

    // Try to connect and ensure buckets exist
    try {
      await this.ensureBucketsExist();
      this.isMinioAvailable = true;
      this.logger.log('MinIO connection established');
    } catch (error) {
      this.logger.warn('MinIO is not available. File uploads will be disabled.');
      this.isMinioAvailable = false;
    }
  }

  /**
   * Check if MinIO storage is available
   */
  isStorageAvailable(): boolean {
    return this.isMinioAvailable;
  }

  /**
   * Ensure all required buckets exist
   */
  private async ensureBucketsExist(): Promise<void> {
    for (const bucket of this.buckets) {
      try {
        const exists = await this.minioClient.bucketExists(bucket);
        if (!exists) {
          await this.minioClient.makeBucket(bucket, 'tr-istanbul');
          this.logger.log('Created MinIO bucket');

          // Set public read policy for products and avatars
          if (['products', 'avatars', 'collections'].includes(bucket)) {
            const policy = {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: { AWS: ['*'] },
                  Action: ['s3:GetObject'],
                  Resource: [`arn:aws:s3:::${bucket}/*`],
                },
              ],
            };
            await this.minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
          }
        }
      } catch (error) {
        this.logger.warn('Failed to create bucket');
      }
    }
  }

  /**
   * Upload file from buffer
   */
  async uploadFile(
    buffer: Buffer,
    options: UploadOptions,
    uploaderId?: string,
  ): Promise<UploadResult> {
    // Check if MinIO is available
    if (!this.isMinioAvailable) {
      throw new BadRequestException(
        'Dosya yükleme servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin veya sistem yöneticisiyle iletişime geçin.'
      );
    }

    // Validate bucket
    if (!this.buckets.includes(options.bucket)) {
      throw new BadRequestException(`Geçersiz bucket: ${options.bucket}`);
    }

    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('Dosya boyutu çok büyük (max 10MB)');
    }

    // Validate mime type for images
    if (options.bucket === 'products' || options.bucket === 'avatars') {
      if (!options.mimeType || !ALLOWED_IMAGE_TYPES.includes(options.mimeType)) {
        throw new BadRequestException('Geçersiz dosya tipi. Sadece JPEG, PNG, WebP, GIF desteklenir.');
      }
    }

    // Generate unique key
    const ext = this.getExtension(options.mimeType || 'application/octet-stream');
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const filename = options.filename || `${uniqueId}${ext}`;
    const folder = options.folder ? `${options.folder}/` : '';
    const key = `${folder}${filename}`;

    try {
      // Upload to MinIO
      await this.minioClient.putObject(
        options.bucket,
        key,
        buffer,
        buffer.length,
        {
          'Content-Type': options.mimeType || 'application/octet-stream',
        },
      );

      // Generate URL
      const baseUrl = this.configService.get('MINIO_PUBLIC_URL', 
        `http://${this.configService.get('MINIO_ENDPOINT', 'localhost')}:${this.configService.get('MINIO_PORT', '9000')}`
      );
      const url = `${baseUrl}/${options.bucket}/${key}`;

      // Store in database
      await this.prisma.mediaFile.create({
        data: {
          bucket: options.bucket,
          key,
          filename,
          mimeType: options.mimeType || 'application/octet-stream',
          size: buffer.length,
          uploaderId,
          entityType: options.entityType,
          entityId: options.entityId,
          isPublic: options.isPublic ?? true,
          url,
        },
      });

      return {
        key,
        url,
        bucket: options.bucket,
        size: buffer.length,
        mimeType: options.mimeType || 'application/octet-stream',
      };
    } catch (error) {
      this.logger.error('MinIO upload error');
      throw new InternalServerErrorException('Dosya yükleme başarısız');
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Array<{ buffer: Buffer; mimeType: string; filename?: string }>,
    options: Omit<UploadOptions, 'filename' | 'mimeType'>,
    uploaderId?: string,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadFile(
        file.buffer,
        {
          ...options,
          filename: file.filename,
          mimeType: file.mimeType,
        },
        uploaderId,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    // Always delete from database even if MinIO is unavailable
    await this.prisma.mediaFile.deleteMany({
      where: { bucket, key },
    });

    // Try to delete from MinIO if available
    if (this.isMinioAvailable) {
      try {
        await this.minioClient.removeObject(bucket, key);
      } catch (error) {
        this.logger.warn('MinIO delete error');
        // Don't throw - database record is already deleted
      }
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(files: Array<{ bucket: string; key: string }>): Promise<void> {
    for (const file of files) {
      await this.deleteFile(file.bucket, file.key);
    }
  }

  /**
   * Get presigned URL for upload
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isMinioAvailable) {
      throw new BadRequestException('Dosya yükleme servisi şu anda kullanılamıyor.');
    }

    if (!this.buckets.includes(bucket)) {
      throw new BadRequestException(`Geçersiz bucket: ${bucket}`);
    }

    try {
      return await this.minioClient.presignedPutObject(bucket, key, expirySeconds);
    } catch (error) {
      this.logger.error('MinIO presigned URL error');
      throw new InternalServerErrorException('Presigned URL oluşturulamadı');
    }
  }

  /**
   * Get presigned URL for download
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isMinioAvailable) {
      throw new BadRequestException('Dosya indirme servisi şu anda kullanılamıyor.');
    }

    try {
      return await this.minioClient.presignedGetObject(bucket, key, expirySeconds);
    } catch (error) {
      this.logger.error('MinIO presigned URL error');
      throw new InternalServerErrorException('Presigned URL oluşturulamadı');
    }
  }

  /**
   * Get files by entity
   */
  async getFilesByEntity(entityType: string, entityId: string) {
    return this.prisma.mediaFile.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get file extension from mime type
   */
  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
    };
    return map[mimeType] || '';
  }

  /**
   * Validate image for product (diecast relevance check ready)
   */
  async validateProductImage(buffer: Buffer): Promise<{ valid: boolean; reason?: string }> {
    // Basic validation - size and type
    if (buffer.length < 1024) {
      return { valid: false, reason: 'Resim çok küçük' };
    }

    if (buffer.length > MAX_FILE_SIZE) {
      return { valid: false, reason: 'Resim çok büyük (max 10MB)' };
    }

    // AI validation placeholder - can integrate with image classification API
    // For now, always return valid
    // In production, this would call an AI service to check:
    // - Is it a diecast model car?
    // - Is it offensive content?
    // - Is it unrelated content?

    return { valid: true };
  }
}
