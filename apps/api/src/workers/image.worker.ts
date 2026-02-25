/**
 * Image Processing Worker
 * Handles image resizing, optimization, and thumbnail generation
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StorageService } from '../modules/storage/storage.service';

export interface ImageJobData {
  sourceKey: string;
  bucket: string;
  userId?: string;
  productId?: string;
  generateThumbnails?: boolean;
  thumbnailSizes?: Array<{ width: number; height: number; suffix: string }>;
  optimize?: boolean;
  quality?: number;
}

const DEFAULT_THUMBNAIL_SIZES = [
  { width: 150, height: 150, suffix: '_thumb' },
  { width: 300, height: 300, suffix: '_small' },
  { width: 600, height: 600, suffix: '_medium' },
  { width: 1200, height: 1200, suffix: '_large' },
];

@Processor('image')
export class ImageWorker {
  private readonly logger = new Logger(ImageWorker.name);

  constructor(private readonly storageService: StorageService) {}

  @Process('process')
  async handleProcess(job: Job<ImageJobData>) {
    this.logger.log(`Processing image job ${job.id} for ${job.data.sourceKey}`);

    const {
      sourceKey,
      bucket,
      generateThumbnails = true,
      thumbnailSizes = DEFAULT_THUMBNAIL_SIZES,
      optimize = true,
      quality = 85,
    } = job.data;

    try {
      // Download original image from S3 using presigned URL
      const presignedUrl = await this.storageService.getPresignedDownloadUrl(
        bucket,
        sourceKey,
        3600
      );
      
      const response = await fetch(presignedUrl);
      const originalBuffer = Buffer.from(await response.arrayBuffer());

      this.logger.log(`Downloaded image: ${sourceKey}, size: ${originalBuffer.length} bytes`);

      // For now, we'll just log what would be processed
      // In production, you'd use sharp or similar for actual processing
      const results = {
        original: {
          key: sourceKey,
          size: originalBuffer.length,
        },
        thumbnails: [] as Array<{ key: string; width: number; height: number }>,
      };

      if (generateThumbnails) {
        for (const size of thumbnailSizes) {
          const ext = sourceKey.substring(sourceKey.lastIndexOf('.'));
          const baseName = sourceKey.substring(0, sourceKey.lastIndexOf('.'));
          const thumbnailKey = `${baseName}${size.suffix}${ext}`;

          // In production: use sharp to resize and optimize
          // const resizedBuffer = await sharp(originalBuffer)
          //   .resize(size.width, size.height, { fit: 'inside' })
          //   .jpeg({ quality })
          //   .toBuffer();
          
          // For now, we'll upload the original as a placeholder
          // Extract folder from sourceKey if exists
          const folderMatch = sourceKey.match(/^(.+\/)/);
          const folder = folderMatch ? folderMatch[1] : '';
          const filename = thumbnailKey.replace(folder, '');
          
          await this.storageService.uploadFile(
            originalBuffer,
            {
              bucket: bucket as 'products' | 'avatars' | 'documents' | 'collections' | 'tickets',
              folder: folder.replace(/\/$/, ''),
              filename,
              mimeType: 'image/jpeg',
            }
          );

          results.thumbnails.push({
            key: thumbnailKey,
            width: size.width,
            height: size.height,
          });

          this.logger.log(`Created thumbnail: ${thumbnailKey}`);
        }
      }

      return { success: true, results };
    } catch (error: any) {
      this.logger.error(`Failed to process image ${sourceKey}: ${error.message}`);
      throw error;
    }
  }

  @Process('delete')
  async handleDelete(job: Job<{ keys: string[]; bucket: string }>) {
    this.logger.log(`Processing image deletion job ${job.id}`);

    const { keys, bucket } = job.data;
    const results = [];

    for (const key of keys) {
      try {
        await this.storageService.deleteFile(bucket, key);
        results.push({ key, deleted: true });
        this.logger.log(`Deleted image: ${key}`);
      } catch (error: any) {
        results.push({ key, deleted: false, error: error.message });
        this.logger.error(`Failed to delete image ${key}: ${error.message}`);
      }
    }

    return { success: true, results };
  }

  @Process('generate-avatar')
  async handleGenerateAvatar(job: Job<{ userId: string; sourceKey: string }>) {
    this.logger.log(`Generating avatar for user ${job.data.userId}`);

    const { userId, sourceKey } = job.data;
    const bucket = 'avatars';

    // Process avatar with specific sizes
    return this.handleProcess({
      ...job,
      data: {
        sourceKey,
        bucket,
        userId,
        generateThumbnails: true,
        thumbnailSizes: [
          { width: 50, height: 50, suffix: '_50' },
          { width: 100, height: 100, suffix: '_100' },
          { width: 200, height: 200, suffix: '_200' },
        ],
      },
    } as Job<ImageJobData>);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Image processing job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Image processing job ${job.id} failed: ${error.message}`);
  }
}
