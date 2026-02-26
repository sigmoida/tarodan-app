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

// Upload photo to S3 using StorageService
const uploadPhotoToS3 = async (
  storageService: StorageService,
  photo: PhotoFile,
  bucket: 'products' | 'avatars' | 'documents' | 'collections' | 'tickets' = 'products',
  folder: string = 'product-images'
): Promise<{ key: string } | null> => {
  try {
    // Generate unique filename
    const uniqueId = randomUUID().substring(0, 8);
    const ext = path.extname(photo.filename);
    const filename = `${uniqueId}-${photo.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to S3 using StorageService
    const result = await storageService.uploadFile(
      photo.buffer,
      {
        bucket,
        folder,
        filename,
        mimeType: photo.mimeType,
      }
    );

    return { key: result.key };
  } catch (error: any) {
    console.error(`⚠️ Failed to upload photo ${photo.filename} to S3:`, error.message);
    return null;
  }
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

  // Load photos
  const photos = loadPhotosFromFolder();
  if (photos.length === 0) {
    console.error('❌ No photos found. Exiting.');
    process.exit(1);
  }

  // Upload photos to S3
  console.log(`📤 Uploading ${photos.length} photos to S3...`);
  const uploadedPhotos: Array<{ key: string; filename: string; photo: PhotoFile }> = [];
  
  for (const photo of photos) {
    const result = await uploadPhotoToS3(storageService, photo);
    if (result) {
      uploadedPhotos.push({
        key: result.key,
        filename: photo.filename,
        photo: photo,
      });
    }
  }

  if (uploadedPhotos.length === 0) {
    console.error('❌ No photos were uploaded. Exiting.');
    process.exit(1);
  }

  console.log(`✅ Successfully uploaded ${uploadedPhotos.length} photos to S3\n`);

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

  // Process each product
  for (const product of allProducts) {
    const hasRealImage = product.images.some(img => 
      img.url && 
      !img.url.includes('placeholder') && 
      !img.url.includes('via.placeholder')
    );
    const hasAnyImage = product.images.length > 0;

    if (hasRealImage) {
      // Product already has real image, skip
      skippedCount++;
      continue;
    }

    // Select a random photo (round-robin if all used)
    const selectedPhoto = uploadedPhotos[roundRobinIndex % uploadedPhotos.length];
    roundRobinIndex++;

    if (hasAnyImage) {
      // Replace placeholder images
      await prisma.productImage.deleteMany({
        where: {
          productId: product.id,
        },
      });
      replacedCount++;
    } else {
      // Add new image
      addedCount++;
    }

    // Store S3 key in the database (presigned URL is generated on-demand by the API)
    try {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: selectedPhoto.key, // S3 key: "dev/products/product-images/abc123.jpg"
          sortOrder: 0,
        },
      });
    } catch (error: any) {
      console.error(`⚠️ Failed to create image record for ${selectedPhoto.key}:`, error.message);
      skippedCount++;
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
