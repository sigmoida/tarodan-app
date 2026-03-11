import { PrismaClient, ProductStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/modules/storage/storage.service';
import { PrismaService } from '../src/prisma';

const prisma = new PrismaClient();

interface PhotoFile {
  filename: string;
  filepath: string;
  mimeType: string;
  buffer: Buffer;
}

// Initialize StorageService for script
const initStorageService = (): StorageService | null => {
  try {
    // Create mock ConfigService
    const configService = {
      get: (key: string, defaultValue?: any) => {
        return process.env[key] || defaultValue;
      },
    } as any;

    // Create PrismaService instance
    const prismaService = new PrismaService();

    // Create StorageService instance
    const storageService = new StorageService(configService, prismaService);
    
    return storageService;
  } catch (error) {
    console.error('⚠️ Failed to initialize StorageService:', error);
    return null;
  }
};

// Get MIME type from file extension
const getMimeType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return mimeTypes[ext] || 'image/jpeg';
};

// Load photos from photos folder
const loadPhotosFromFolder = (): PhotoFile[] => {
  const photosDir = path.join(process.cwd(), '..', '..', 'photos');
  const photos: PhotoFile[] = [];

  try {
    if (!fs.existsSync(photosDir)) {
      console.log(`⚠️ Photos directory not found: ${photosDir}`);
      return photos;
    }

    const files = fs.readdirSync(photosDir);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const filepath = path.join(photosDir, file);
        try {
          const buffer = fs.readFileSync(filepath);
          photos.push({
            filename: file,
            filepath: filepath,
            mimeType: getMimeType(file),
            buffer: buffer,
          });
        } catch (error) {
          console.error(`⚠️ Failed to read photo ${file}:`, error);
        }
      }
    }

    console.log(`📸 Loaded ${photos.length} photos from ${photosDir}`);
  } catch (error) {
    console.error('⚠️ Error loading photos:', error);
  }

  return photos;
};

let sharp: any;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const CACHE_OPTS = {
  contentType: 'image/webp' as const,
  cacheControl: 'public, max-age=31536000, immutable',
  skipMediaFile: true,
};

const uploadProductImageVariants = async (
  storageService: StorageService,
  photo: PhotoFile,
  productId: string,
): Promise<{ cardKey: string; detailKey: string }> => {
  if (!sharp) throw new Error('sharp not installed - run pnpm add sharp in apps/api');
  const baseId = randomUUID();
  const folder = `product-images/${productId}`;

  const cardBuffer = await sharp(photo.buffer)
    .resize(500, 500, { fit: 'cover' })
    .webp({ quality: 85 })
    .toBuffer();

  const detailBuffer = await sharp(photo.buffer)
    .resize(1200, 1200, { fit: 'inside' })
    .webp({ quality: 90 })
    .toBuffer();

  const cardResult = await storageService.uploadFile(cardBuffer, {
    bucket: 'products',
    folder,
    filename: `${baseId}-card.webp`,
    mimeType: 'image/webp',
    ...CACHE_OPTS,
  });

  const detailResult = await storageService.uploadFile(detailBuffer, {
    bucket: 'products',
    folder,
    filename: `${baseId}-detail.webp`,
    mimeType: 'image/webp',
    ...CACHE_OPTS,
  });

  return { cardKey: cardResult.key, detailKey: detailResult.key };
};

async function main() {
  console.log('🖼️  Starting to add images to all products...\n');

  // Initialize StorageService
  const storageService = initStorageService();
  if (!storageService) {
    console.error('❌ StorageService not available. Exiting.');
    process.exit(1);
  }

  // Initialize storage service
  await storageService.onModuleInit();
  
  if (!storageService.isStorageAvailable()) {
    console.error('❌ S3 storage not available. Exiting.');
    process.exit(1);
  }

  if (!sharp) {
    console.error('❌ sharp not installed. Run pnpm add sharp in apps/api');
    process.exit(1);
  }

  // Load photos
  const photos = loadPhotosFromFolder();
  if (photos.length === 0) {
    console.error('❌ No photos found. Exiting.');
    process.exit(1);
  }

  console.log(`📤 Photos loaded. Uploading per-product (card + detail variants)\n`);

  // Get all products (all statuses)
  const allProducts = await prisma.product.findMany({
    include: {
      images: true,
    },
  });

  console.log(`📦 Found ${allProducts.length} active products\n`);

  let addedCount = 0;
  let replacedCount = 0;
  let skippedCount = 0;
  let roundRobinIndex = 0;

  for (const product of allProducts) {
    const hasRealImage = product.images.some(img =>
      img.cardKey && (img.cardKey.includes('dev/') || img.cardKey.includes('prod/'))
    );
    const hasAnyImage = product.images.length > 0;

    if (hasRealImage) {
      skippedCount++;
      continue;
    }

    const selectedPhoto = photos[roundRobinIndex % photos.length];
    roundRobinIndex++;

    if (hasAnyImage) {
      await prisma.productImage.deleteMany({
        where: { productId: product.id },
      });
      replacedCount++;
    } else {
      addedCount++;
    }

    try {
      const { cardKey, detailKey } = await uploadProductImageVariants(
        storageService,
        selectedPhoto,
        product.id,
      );
      await prisma.productImage.create({
        data: {
          productId: product.id,
          cardKey,
          detailKey,
          sortOrder: 0,
        },
      });
    } catch (error: any) {
      console.error(`❌ Failed to upload/create image for product ${product.id}:`, error.message);
      throw error;
    }
  }

  console.log('\n✅ Process completed!');
  console.log(`📊 Summary:`);
  console.log(`   - Products with images added: ${addedCount}`);
  console.log(`   - Products with placeholder replaced: ${replacedCount}`);
  console.log(`   - Products skipped (already have real images): ${skippedCount}`);
  console.log(`   - Total processed: ${addedCount + replacedCount + skippedCount}`);
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
