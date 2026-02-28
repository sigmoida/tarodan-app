import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

export interface UploadResult {
  key: string;
  // URL artık presigned URL değil, sadece identifier
  // Gerçek erişim için getPresignedDownloadUrl() kullanılmalı
  url?: string; // Deprecated - sadece backward compatibility için
  bucket: string;
  size: number;
  mimeType: string;
}

export interface UploadOptions {
  bucket: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets';
  folder?: string;
  filename?: string;
  mimeType?: string;
  isPublic?: boolean; // Artık kullanılmıyor, her şey private
  entityType?: string;
  entityId?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private readonly baseBucket: string;
  private readonly envPrefix: string;
  private isS3Available = false;
  private hasCredentials = false;

  // Bucket tipleri -> klasör isimleri mapping
  private readonly bucketFolders = {
    products: 'products',
    avatars: 'avatars',
    documents: 'documents',
    collections: 'collections',
    tickets: 'tickets',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseBucket = this.configService.get('S3_BUCKET', 'amzn-tarodan');
    
    // Environment prefix belirle
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    this.envPrefix = this.configService.get('S3_ENV_PREFIX') || 
                    (nodeEnv === 'production' ? 'prod' : 'dev');

    // Credentials kontrolü - yoksa S3Client oluşturma
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('⚠️ AWS S3 credentials not configured. Storage will be unavailable.');
      this.hasCredentials = false;
      return;
    }

    this.hasCredentials = true;

    // S3 Client oluştur (MinIO veya AWS S3)
    const s3Config: any = {
      region: this.configService.get('AWS_REGION', 'eu-west-1'),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    const s3Endpoint = this.configService.get<string>('S3_ENDPOINT');
    if (s3Endpoint) {
      s3Config.endpoint = s3Endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);

    this.logger.log(`S3 Storage initialized: ${this.baseBucket} (${this.envPrefix})`);
  }

  async onModuleInit() {
    if (!this.hasCredentials || !this.s3Client) {
      this.logger.warn('⚠️ Skipping S3 bucket check - no credentials configured.');
      this.isS3Available = false;
      return;
    }

    try {
      // Bucket'ın varlığını kontrol et
      await this.s3Client.send(
        new HeadBucketCommand({ Bucket: this.baseBucket })
      );
      this.isS3Available = true;
      this.logger.log(`✅ AWS S3 connection established: ${this.baseBucket}`);
    } catch (error: any) {
      this.logger.error(`❌ AWS S3 connection failed: ${error.message}`);
      this.isS3Available = false;
    }
  }

  /**
   * Check if S3 storage is available
   */
  isStorageAvailable(): boolean {
    return this.isS3Available;
  }

  /**
   * Ana upload fonksiyonu - "create content" tarzı
   * Seed script'lerinde de kullanılabilir
   * Tüm dosya yüklemeleri bu fonksiyon üzerinden yapılır
   */
  async uploadFile(
    buffer: Buffer,
    options: UploadOptions,
    uploaderId?: string,
  ): Promise<UploadResult> {
    if (!this.isS3Available) {
      throw new BadRequestException(
        'Dosya yükleme servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.'
      );
    }

    // Bucket tipini validate et
    if (!this.bucketFolders[options.bucket]) {
      throw new BadRequestException(`Geçersiz bucket tipi: ${options.bucket}`);
    }

    // Dosya boyutu kontrolü
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('Dosya boyutu çok büyük (max 10MB)');
    }

    // Resim dosyaları için mime type kontrolü
    if (['products', 'avatars', 'collections'].includes(options.bucket)) {
      if (!options.mimeType || !ALLOWED_IMAGE_TYPES.includes(options.mimeType)) {
        throw new BadRequestException(
          'Geçersiz dosya tipi. Sadece JPEG, PNG, WebP, GIF desteklenir.'
        );
      }
    }

    // Unique key oluştur
    const ext = this.getExtension(options.mimeType || 'application/octet-stream');
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const filename = options.filename || `${uniqueId}${ext}`;
    
    // Klasör yapısı: {env}/{bucketType}/{folder}/{filename}
    // Örnek: dev/products/product-images/abc123.jpg
    const bucketFolder = this.bucketFolders[options.bucket];
    const customFolder = options.folder ? `${options.folder}/` : '';
    const key = `${this.envPrefix}/${bucketFolder}/${customFolder}${filename}`;

    try {
      // S3'e yükle - PRIVATE (public read yok)
      const command = new PutObjectCommand({
        Bucket: this.baseBucket,
        Key: key,
        Body: buffer,
        ContentType: options.mimeType || 'application/octet-stream',
        // Public erişim YOK - sadece presigned URL ile erişilebilir
        Metadata: {
          'uploader-id': uploaderId || '',
          'entity-type': options.entityType || '',
          'entity-id': options.entityId || '',
        },
      });

      await this.s3Client.send(command);

      // Database'e kaydet
      // URL artık presigned URL değil, sadece identifier olarak key kullanılıyor
      await this.prisma.mediaFile.create({
        data: {
          bucket: options.bucket, // Orijinal bucket tipi (products, avatars, vs.)
          key,                     // Full S3 key (dev/products/...)
          filename,
          mimeType: options.mimeType || 'application/octet-stream',
          size: buffer.length,
          uploaderId,
          entityType: options.entityType,
          entityId: options.entityId,
          isPublic: false, // Artık her şey private
          url: key, // URL yerine key saklanıyor, presigned URL endpoint'ten alınacak
        },
      });

      this.logger.log(`✅ File uploaded (private): ${key}`);

      return {
        key,
        bucket: options.bucket, // Orijinal bucket tipi
        size: buffer.length,
        mimeType: options.mimeType || 'application/octet-stream',
      };
    } catch (error: any) {
      this.logger.error(`❌ S3 upload error: ${error.message}`, error);
      throw new InternalServerErrorException('Dosya yükleme başarısız');
    }
  }

  /**
   * Multiple files upload
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
    // Database'den sil
    await this.prisma.mediaFile.deleteMany({
      where: { bucket, key },
    });

    // S3'ten sil
    if (this.isS3Available) {
      try {
        // Key zaten full path içeriyor (dev/products/...)
        // Eğer sadece relative key geliyorsa, env prefix ekle
        const fullKey = key.startsWith(this.envPrefix) 
          ? key 
          : `${this.envPrefix}/${this.bucketFolders[bucket as keyof typeof this.bucketFolders]}/${key}`;

        const command = new DeleteObjectCommand({
          Bucket: this.baseBucket,
          Key: fullKey,
        });

        await this.s3Client.send(command);
        this.logger.log(`✅ File deleted: ${fullKey}`);
      } catch (error: any) {
        this.logger.warn(`⚠️ S3 delete error: ${error.message}`);
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
   * Presigned URL for upload (client-side upload için)
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isS3Available) {
      throw new BadRequestException('Dosya yükleme servisi şu anda kullanılamıyor.');
    }

    const bucketFolder = this.bucketFolders[bucket as keyof typeof this.bucketFolders];
    if (!bucketFolder) {
      throw new BadRequestException(`Geçersiz bucket: ${bucket}`);
    }

    // Key zaten full path içeriyorsa kullan, değilse oluştur
    const fullKey = key.startsWith(this.envPrefix)
      ? key
      : `${this.envPrefix}/${bucketFolder}/${key}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.baseBucket,
        Key: fullKey,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
    } catch (error: any) {
      this.logger.error(`❌ Presigned upload URL error: ${error.message}`);
      throw new InternalServerErrorException('Presigned URL oluşturulamadı');
    }
  }

  /**
   * Presigned URL for download - ANA ERİŞİM YÖNTEMİ
   * Tüm dosyalar bu yöntemle erişilir (private bucket)
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expirySeconds = 3600,
  ): Promise<string> {
    if (!this.isS3Available) {
      throw new BadRequestException('Dosya indirme servisi şu anda kullanılamıyor.');
    }

    const bucketFolder = this.bucketFolders[bucket as keyof typeof this.bucketFolders];
    // Key zaten full path içeriyorsa kullan, değilse oluştur
    const fullKey = key.startsWith(this.envPrefix)
      ? key
      : `${this.envPrefix}/${bucketFolder}/${key}`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.baseBucket,
        Key: fullKey,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
    } catch (error: any) {
      this.logger.error(`❌ Presigned download URL error: ${error.message}`);
      throw new InternalServerErrorException('Presigned URL oluşturulamadı');
    }
  }

  /**
   * Get files by entity - presigned URL'ler ile birlikte
   */
  async getFilesByEntity(
    entityType: string, 
    entityId: string,
    includePresignedUrls = true,
    expirySeconds = 3600
  ) {
    const files = await this.prisma.mediaFile.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });

    // Presigned URL'leri ekle
    if (includePresignedUrls && this.isS3Available) {
      const filesWithUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const presignedUrl = await this.getPresignedDownloadUrl(
              file.bucket,
              file.key,
              expirySeconds
            );
            return {
              ...file,
              presignedUrl,
            };
          } catch (error) {
            this.logger.warn(`Failed to generate presigned URL for ${file.key}`);
            return file;
          }
        })
      );
      return filesWithUrls;
    }

    return files;
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
   * Validate image for product
   */
  async validateProductImage(buffer: Buffer): Promise<{ valid: boolean; reason?: string }> {
    if (buffer.length < 1024) {
      return { valid: false, reason: 'Resim çok küçük' };
    }

    if (buffer.length > MAX_FILE_SIZE) {
      return { valid: false, reason: 'Resim çok büyük (max 10MB)' };
    }

    return { valid: true };
  }
}
