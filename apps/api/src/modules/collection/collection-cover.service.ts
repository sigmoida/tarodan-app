import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { CollectionResponseDto } from './dto';
import { CollectionCommonService } from './collection-common.service';
import * as https from 'https';
import * as http from 'http';

// Sharp is optional. Yükleme hatası sessizce yutulmasın (bkz. media.service —
// staging'de sharp'sız imaj tek 400 ile teşhis edilemiyordu).
let sharp: any;
try {
  sharp = require('sharp');
} catch (e: any) {
  sharp = null;
  // eslint-disable-next-line no-console
  console.error(
    `[CollectionCoverService] sharp failed to load: ${e?.message ?? e}`,
  );
}

/**
 * CollectionCoverService — kapak resmi işleri: updateCollectionCover ve
 * generateCoverImage (media/storage üzerinden 2x2 grid/tekil kapak üretimi).
 * generateCoverImage crud tarafından da (this.cover.generateCoverImage) çağrılır;
 * bu yüzden public kalır. mapCollectionToDto için common'a delege edilir.
 */
@Injectable()
export class CollectionCoverService {
  private readonly logger = new Logger(CollectionCoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly storageService: StorageService,
    private readonly common: CollectionCommonService,
  ) {}

  // ==========================================================================
  // UPDATE COLLECTION COVER IMAGE
  // ==========================================================================
  async updateCollectionCover(
    collectionId: string,
    userId: string,
    coverImageKey: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyonu düzenleme yetkiniz yok');
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { coverImageKey },
      include: {
        user: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              include: { 
                images: { 
                  take: 1
                } 
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return await this.common.mapCollectionToDto(updated, false);
  }

  // ==========================================================================
  // GENERATE COVER IMAGE FROM COLLECTION ITEMS
  // ==========================================================================
  private async downloadImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  async generateCoverImage(collectionId: string): Promise<string | null> {
    if (!sharp) {
      this.logger.warn('Sharp not available, skipping cover image generation');
      return null;
    }

    try {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: {
                    take: 1,
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
            take: 4,
          },
        },
      });

      if (!collection || collection.items.length === 0) {
        return null;
      }

      // Get image URLs from items (product cardKey -> public URL, or customImageUrl)
      const imageUrls: string[] = [];
      for (const item of collection.items) {
        const firstImg = item.product?.images?.[0];
        const rawUrl = item.customImageUrl || (firstImg?.cardKey ? this.storageService.getPublicAssetUrl(firstImg.cardKey) : null);
        if (rawUrl) {
          const resolved = await this.resolveProductImageUrl(rawUrl);
          if (resolved) imageUrls.push(resolved);
        }
        if (imageUrls.length >= 4) break;
      }

      if (imageUrls.length === 0) {
        return null;
      }

      // If less than 4 images, use the first one
      if (imageUrls.length < 4) {
        const singleImageUrl = imageUrls[0];
        try {
          const imageBuffer = await this.downloadImage(singleImageUrl);
          const resizedBuffer = await sharp(imageBuffer)
            .resize(1200, 600, { fit: 'cover' })
            .toBuffer();

          // Upload to S3 using MediaService
          const uploadResult = await this.mediaService.uploadBuffer(resizedBuffer, {
            folder: 'collection-covers',
            mimeType: 'image/jpeg',
            bucket: 'collections',
          });

          await this.prisma.collection.update({
            where: { id: collectionId },
            data: { coverImageKey: uploadResult.key },
          });

          return uploadResult.key;
        } catch (error) {
          this.logger.error(`Failed to generate single cover image: ${error.message}`);
          return null;
        }
      }

      // Download and resize images to 400x400
      const imageBuffers: Buffer[] = [];
      for (const url of imageUrls) {
        try {
          const buffer = await this.downloadImage(url);
          const resized = await sharp(buffer)
            .resize(400, 400, { fit: 'cover' })
            .toBuffer();
          imageBuffers.push(resized);
        } catch (error) {
          this.logger.warn(`Failed to download image ${url}: ${error.message}`);
        }
      }

      if (imageBuffers.length === 0) {
        return null;
      }

      // Create 2x2 grid (800x800)
      const gridWidth = 800;
      const gridHeight = 800;
      const cellWidth = 400;
      const cellHeight = 400;

      const composite = sharp({
        create: {
          width: gridWidth,
          height: gridHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      });

      const composites = [];
      for (let i = 0; i < Math.min(4, imageBuffers.length); i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        composites.push({
          input: imageBuffers[i],
          left: col * cellWidth,
          top: row * cellHeight,
        });
      }

      const finalBuffer = await composite.composite(composites).jpeg().toBuffer();

      // Upload to S3 using MediaService
      const uploadResult = await this.mediaService.uploadBuffer(finalBuffer, {
        folder: 'collection-covers',
        mimeType: 'image/jpeg',
        bucket: 'collections',
      });

      await this.prisma.collection.update({
        where: { id: collectionId },
        data: { coverImageKey: uploadResult.key },
      });

      return uploadResult.key;
    } catch (error) {
      this.logger.error(`Failed to generate cover image: ${error.message}`);
      return null;
    }
  }

  private async resolveProductImageUrl(imageUrl: string | null | undefined): Promise<string | null> {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/')) return imageUrl;
    // S3 key (dev/ or prod/) -> public URL
    if (imageUrl.includes('dev/') || imageUrl.includes('prod/')) {
      return this.storageService.getPublicAssetUrl(imageUrl);
    }
    try {
      return await this.storageService.getPresignedDownloadUrl('products', imageUrl, 3600);
    } catch (e: any) {
      this.logger.warn(`Failed to resolve product image: ${imageUrl} - ${e.message}`);
      return null;
    }
  }
}
